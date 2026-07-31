/**
 * TC-COPY-002-013 — concurrent close protection: two simultaneous closes must not over-close beyond the
 * held quantity or open a reverse/short. Relies on the app's advisory lock + 3s dedup + close-clamp.
 * Manual: copy-002__close-detection-clamp.md. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { orderRow, childId, sideOrderCount, sideQtySum } from '../../../common/tradingSetup.js';

const SYM = 'NVDA';

test.describe('Concurrent close (mock broker)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-COPY-002-013 two concurrent closes never exceed held qty and open no short @trading @api @P0 @concurrency', async ({ api, config }, info) => {
    meta(info, 'COPY-002');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      // trader holds 10; subscriber mirror-entry filled to 10
      const entryRes = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 10, 'buy'));
      const entryId = (await entryRes.json()).id as string;
      await mb.setOrderStatus(entryId, 'filled', 10, 100);
      mb.syncFills(p.brokerAccountId);
      await expect.poll(() => childId(config, entryId, sub.user_id) !== '', { timeout: 20000 }).toBe(true);
      const subEntry = childId(config, entryId, sub.user_id);
      await mb.setOrderStatus(subEntry, 'filled', 10, 100);
      mb.syncFills(sub.account_id!);
      expect(Number(orderRow(config, subEntry).filled_quantity)).toBe(10);

      // fire TWO identical closes concurrently
      await mb.runConcurrentClose(() => trades.closeOrder(api, p.traderAccess, entryId, 10) as unknown as Promise<unknown>, 2);

      // trader reverse: exactly ONE SELL (advisory lock + 3s dedup collapsed the pair)
      await expect.poll(() => sideOrderCount(config, p.traderId, SYM, 'sell'), { timeout: 20000 }).toBe(1);
      // subscriber close: exactly one mirror, total close qty never exceeds the held 10 (no over-close/short)
      await expect.poll(() => sideOrderCount(config, sub.user_id, SYM, 'sell'), { timeout: 20000 }).toBe(1);
      expect(sideQtySum(config, sub.user_id, SYM, 'sell'), 'total submitted close ≤ held').toBeLessThanOrEqual(10);
      // broker exit-call count is bounded (no duplicate exit stack)
      expect(await mb.getExitCallCount(sub.account_id!), 'subscriber exit placed at most once').toBeLessThanOrEqual(1);
      expect(await mb.getExitCallCount(p.brokerAccountId), 'trader close bounded by dedup').toBeLessThanOrEqual(2);
    } finally {
      p.cleanup();
    }
  });
});
