/**
 * Close-side P0s unlocked by the controllable mock broker: close-quantity clamp to held, the
 * zero-held no-reverse guard, and the is_closing-on-transient-retry potential defect. Held size is
 * established via fill-sync (Order.filled_quantity), which is what _closeable_quantity reads.
 * Assertions target the SUBSCRIBER's resulting order directly (independent of the close HTTP read,
 * since the single-worker uvicorn can reset the keep-alive after 201 under close-fanout load).
 * Manual: copy-002__close-detection-clamp.md, copy-003__retry-rejection.md. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import {
  orderRow,
  childForUser,
  childId,
  auditCount,
  newestOrderIdForUser,
  otherParentOrderId,
} from '../../../common/tradingSetup.js';

const SYM = 'NVDA';
const childStatus = (cfg: any, parent: string, user: string) => childForUser(cfg, parent, user)?.status ?? 'none';

async function traderHolds(api: any, config: any, mb: MockBroker, p: any, qty: number): Promise<string> {
  const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, qty, 'buy'));
  const entryId = (await res.json()).id as string;
  await mb.setOrderStatus(entryId, 'filled', qty, 100);
  mb.syncFills(p.brokerAccountId);
  expect(orderRow(config, entryId).status).toBe('filled');
  return entryId;
}

/** Fire the close. Under concurrent load the single-worker uvicorn can reset the keep-alive mid-request
 * and roll the reverse order back; retry ONLY when no reverse was created (the app also dedups identical
 * closes within its 3s window, so this can never double-close). */
async function fireClose(api: any, config: any, p: any, entryId: string, qty: number): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await trades.closeOrder(api, p.traderAccess, entryId, qty);
      if (res.status() === 201 || res.status() >= 400) return; // committed, or a definitive error
    } catch {
      if (otherParentOrderId(config, p.traderId, SYM, entryId) !== '') return; // reset AFTER commit
      // reset before commit → rolled back → safe to retry
    }
  }
}

test.describe('Close / positions (mock broker)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-COPY-002-004 mirror close is clamped to the quantity the subscriber holds @trading @api @P0 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'COPY-002');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      const entryId = await traderHolds(api, config, mb, p, 10);
      await expect.poll(() => childId(config, entryId, sub.user_id) !== '', { timeout: 20000 }).toBe(true);
      const subEntry = childId(config, entryId, sub.user_id);
      await mb.setOrderStatus(subEntry, 'filled', 5, 100);
      mb.syncFills(sub.account_id!); // subscriber holds 5 (trader holds 10)
      expect(Number(orderRow(config, subEntry).filled_quantity)).toBe(5);

      await fireClose(api, config, p, entryId, 10);
      // subscriber's close mirror must be clamped to their held 5, on the SELL side
      let closeChild = '';
      await expect
        .poll(
          () => {
            closeChild = newestOrderIdForUser(config, sub.user_id, SYM, subEntry);
            return closeChild !== '';
          },
          { timeout: 20000 },
        )
        .toBe(true);
      const row = orderRow(config, closeChild);
      expect(row.side).toBe('sell');
      expect(Number(row.quantity), 'close clamped to held 5, not trader 10').toBe(5);
      expect(auditCount(config, 'copy.close_clamped')).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-002-006 zero held quantity — close is skipped, no reverse/short opened @trading @api @P0 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'COPY-002');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'reject', { reason: 'asset not tradable' });
      const entryRes = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 10, 'buy'));
      const entryId = (await entryRes.json()).id as string;
      await expect.poll(() => childStatus(config, entryId, sub.user_id), { timeout: 20000 }).toBe('rejected');
      const subEntry = childId(config, entryId, sub.user_id); // rejected: not working, not filled
      await mb.setPlaceOrderResult(sub.account_id!, 'success');
      await mb.setOrderStatus(entryId, 'filled', 10, 100);
      mb.syncFills(p.brokerAccountId); // trader holds 10
      expect(orderRow(config, entryId).status).toBe('filled');

      await fireClose(api, config, p, entryId, 10);
      await expect
        .poll(() => auditCount(config, 'copy.skipped_zero_qty'), { timeout: 20000 })
        .toBeGreaterThanOrEqual(1);
      expect(newestOrderIdForUser(config, sub.user_id, SYM, subEntry), 'no reverse order for a flat subscriber').toBe(
        '',
      );
      expect(await mb.callCount('place', sub.account_id!), 'no broker place for the skipped close').toBe(1); // only the (rejected) entry
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-003-007 transient retry of a CLOSE resets is_closing to false — DEFECT CONFIRM @trading @api @P0 @defect', async ({
    api,
    config,
  }, info) => {
    meta(info, 'COPY-003', ['COPY-002']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{ retry_open: '1m' }]);
    try {
      const sub = p.subs[0]!;
      const entryId = await traderHolds(api, config, mb, p, 10);
      await expect.poll(() => childId(config, entryId, sub.user_id) !== '', { timeout: 20000 }).toBe(true);
      const subEntry = childId(config, entryId, sub.user_id);
      await mb.setOrderStatus(subEntry, 'filled', 10, 100);
      mb.syncFills(sub.account_id!); // subscriber holds 10 → a genuine close, is_closing should stay true
      await mb.setPlaceOrderResult(sub.account_id!, 'transient'); // the CLOSE mirror parks for retry

      await fireClose(api, config, p, entryId, 10);
      let closeChild = '';
      await expect
        .poll(
          () => {
            closeChild = newestOrderIdForUser(config, sub.user_id, SYM, subEntry);
            return closeChild !== '';
          },
          { timeout: 20000 },
        )
        .toBe(true);
      await expect.poll(() => orderRow(config, closeChild).status, { timeout: 20000 }).toBe('retry_pending');
      // Expected (manual): a parked CLOSE keeps is_closing=true. Current app forces it false (copy_engine
      // transient-park has a TODO). Asserting the CURRENT behavior documents the defect (reproduced ×2).
      expect(
        orderRow(config, closeChild).is_closing,
        'DEFECT: is_closing reset to false on transient close retry',
      ).toBe(false);
    } finally {
      p.cleanup();
    }
  });
});
