/**
 * Broker-lifecycle P0s unlocked by the controllable QA mock broker (automation/mock-broker/).
 * Covers rejection persistence, cancel-failure invariant, fill-sync (partial→full), and the
 * transient/permanent retry classification + scheduler re-place. LOCAL-QA only.
 * Manual: trade-001__order-placement.md, trade-002__cancel-close.md, copy-003__retry-rejection.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { orderRow, childForUser, childId, latestParentOrderId, auditCount, parentOrderCount } from '../../../common/tradingSetup.js';

const SYM = 'AAPL';
const childStatus = (cfg: any, parent: string, user: string) => childForUser(cfg, parent, user)?.status ?? 'none';

test.describe('Broker lifecycle (mock broker)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-TRADE-001-008 broker rejection persists REJECTED + reason + audit; exactly one broker call @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'TRADE-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    try {
      await mb.setPlaceOrderResult(p.brokerAccountId, 'reject', { reason: 'asset not tradable' });
      const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      expect(res.status()).toBe(502);
      const oid = latestParentOrderId(config, p.traderId, SYM);
      expect(oid).toBeTruthy();
      const row = orderRow(config, oid);
      expect(row.status).toBe('rejected');
      expect(row.reject_reason.length).toBeGreaterThan(0);
      expect(auditCount(config, 'trader.order_rejected_at_broker', oid)).toBe(1);
      expect(await mb.callCount('place', p.brokerAccountId)).toBe(1); // no duplicate financial action
      expect(parentOrderCount(config, p.traderId, SYM)).toBe(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-TRADE-002-001 cancel broker-error is 502 and does NOT mutate local status (cancel-failure invariant) @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'TRADE-002');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    try {
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      const oid = (await placed.json()).id as string;
      expect(orderRow(config, oid).status).toBe('submitted');
      await mb.setCancelResult(oid, 'fail');
      const res = await trades.cancelOrder(api, p.traderAccess, oid);
      expect(res.status()).toBe(502);
      expect(orderRow(config, oid).status).toBe('submitted'); // invariant: unchanged on broker cancel error
      expect(auditCount(config, 'order.cancel_failed', oid)).toBe(1);
      expect(await mb.callCount('cancel', p.brokerAccountId)).toBe(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-TRADE-001-009 fill-sync advances partial→full from the broker (status + filled_quantity) @trading @api @P0 @integration', async ({ api, config }, info) => {
    meta(info, 'TRADE-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    try {
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      const oid = (await placed.json()).id as string;
      await mb.setOrderStatus(oid, 'partially_filled', 3, 100);
      mb.syncFills(p.brokerAccountId);
      let row = orderRow(config, oid);
      expect(row.status).toBe('partially_filled');
      expect(Number(row.filled_quantity)).toBe(3);
      await mb.setOrderStatus(oid, 'filled', 5, 101);
      mb.syncFills(p.brokerAccountId);
      row = orderRow(config, oid);
      expect(row.status).toBe('filled');
      expect(Number(row.filled_quantity)).toBe(5);
      expect(await mb.callCount('get_order', p.brokerAccountId)).toBeGreaterThanOrEqual(2);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-002-018 mirror broker rejection persists the child as REJECTED @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'COPY-002', ['COPY-001']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'reject', { reason: 'asset not tradable' });
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childStatus(config, parent, sub.user_id), { timeout: 20000 }).toBe('rejected');
      expect(childForUser(config, parent, sub.user_id)!.reject_reason.length).toBeGreaterThan(0);
      expect(await mb.callCount('place', sub.account_id!)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-003-001 transient broker error routes the mirror to RETRY_PENDING with a future retry_at @trading @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'COPY-003');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{ retry_open: '1m' }]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'transient');
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childStatus(config, parent, sub.user_id), { timeout: 20000 }).toBe('retry_pending');
      expect(childForUser(config, parent, sub.user_id)!.hasRetryAt).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-003-004 user-fixable error is a clean REJECTED with no retry @trading @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'COPY-003');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{ retry_open: '1m' }]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'permanent', { reason: 'insufficient buying power for this order' });
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childStatus(config, parent, sub.user_id), { timeout: 20000 }).toBe('rejected');
      const row = childForUser(config, parent, sub.user_id)!;
      expect(row.reject_reason.length).toBeGreaterThan(0);
      expect(row.hasRetryAt).toBe(false); // no retry scheduled for a user-fixable error
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-003-002 retry scheduler re-places a RETRY_PENDING mirror and it succeeds @trading @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'COPY-003');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{ retry_open: '1m' }]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'transient');
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childStatus(config, parent, sub.user_id), { timeout: 20000 }).toBe('retry_pending');
      const cid = childId(config, parent, sub.user_id);
      await mb.setPlaceOrderResult(sub.account_id!, 'success'); // broker recovers
      const r = mb.runRetry(cid);
      expect(r.outcome).toBe('succeeded');
      expect(['submitted', 'accepted', 'filled']).toContain(orderRow(config, cid).status);
    } finally {
      p.cleanup();
    }
  });
});
