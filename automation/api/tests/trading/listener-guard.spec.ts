/**
 * TC-TRADE-001-010 — the broker listener echoing an app-originated order back must NOT create a second
 * parent or re-fan-out. Uses the mock broker's emitBrokerEvent to drive the app's REAL listener handler
 * (trade_listener._persist_and_fanout) with the broker's echo of the trader's own order.
 * Manual: trade-001__order-placement.md. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { parentOrderCount, childOrders, appOriginatedMarkerSet } from '../../../common/tradingSetup.js';

const SYM = 'AAPL';

test.describe('Listener double-fanout guard (mock broker)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-TRADE-001-010 listener echo of an app-originated order does not double-fanout @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'TRADE-001', ['COPY-001']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      // 1) trader places an app-originated order → one parent, one mirror, marker set
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      const parentId = (await placed.json()).id as string;
      await expect.poll(() => childOrders(config, parentId).length, { timeout: 20000 }).toBe(1);
      expect(appOriginatedMarkerSet(config, parentId), 'app-originated marker must be live').toBe(true);
      expect(parentOrderCount(config, p.traderId, SYM)).toBe(1);

      // 2) the broker WS echoes the SAME order back (client_order_id = our order id)
      const ev = mb.emitBrokerEvent({
        trader_id: p.traderId,
        account_id: p.brokerAccountId,
        client_order_id: parentId,
        broker_order_id: `mock-${parentId}`,
        event: 'new',
        status: 'new',
        symbol: SYM,
        side: 'buy',
        quantity: 5,
      });
      expect(ev.emitted).toBe(true);

      // 3) invariant: still exactly one parent and one mirror — no doubling
      expect(parentOrderCount(config, p.traderId, SYM), 'echo must not create a second parent').toBe(1);
      expect(childOrders(config, parentId).length, 'echo must not create a duplicate mirror').toBe(1);
      const distinctChildOwners = new Set(childOrders(config, parentId).map((c) => c.userId));
      expect(distinctChildOwners.has(sub.user_id)).toBe(true);
    } finally {
      p.cleanup();
    }
  });
});
