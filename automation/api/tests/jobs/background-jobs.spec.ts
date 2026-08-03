/**
 * Background Jobs & Recovery — the app's OWN worker services driven grey-box against the controllable
 * mock broker: crash-recovery replay, day-start equity snapshot, retry scheduler (heartbeat + exhaustion),
 * poller enforcement, position reconciler safety, and notification retention. LOCAL-QA only.
 * Manual: manual/test-cases/background-jobs/*.md, notifications/notif-001__notifications.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import * as s from '../../clients/settingsApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import {
  orderRow, childForUser, childId, auditByActor, notifCount, seedNotificationAge, backdateRetryAt, subSetting,
} from '../../../common/tradingSetup.js';

const childStatus = (cfg: any, parent: string, user: string) => childForUser(cfg, parent, user)?.status ?? 'none';

test.describe('Background jobs & recovery', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-JOB-007-010 day-start equity snapshot is recorded once per account/day (dedup) @jobs @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'JOB-007');
    const mb = new MockBroker(config);
    const p = await provisionFanout(api, config, [{}]);
    try {
      const acct = p.subs[0]!.account_id!;
      const first = mb.dayStartEquity(acct, 1000);
      expect(first.rows).toBe(1);
      expect(Number(first.value)).toBe(1000);
      const second = mb.dayStartEquity(acct, 2000); // same day → dedup, keeps the first value
      expect(second.rows, 'no second snapshot the same day').toBe(1);
      expect(Number(second.value)).toBe(1000);
    } finally {
      p.cleanup();
    }
  });

  test('TC-JOB-013-002 the live worker retry scheduler resumes a due RETRY_PENDING order @jobs @api @P1 @recovery', async ({ api, config }, info) => {
    meta(info, 'JOB-013');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{ retry_open: '1m' }]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'transient');
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childStatus(config, parent, sub.user_id), { timeout: 20000 }).toBe('retry_pending');
      const cid = childId(config, parent, sub.user_id);
      // broker recovers; make the retry due → the LIVE worker scheduler (10s tick) must re-place it
      await mb.setPlaceOrderResult(sub.account_id!, 'success');
      backdateRetryAt(config, cid);
      await expect.poll(() => orderRow(config, cid).status, { timeout: 40000 }).toBe('submitted');
      expect(auditByActor(config, 'copy.retry_succeeded', sub.user_id)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-JOB-001-001 crash recovery replays an orphaned PENDING child order @jobs @api @P1 @recovery', async ({ api, config }, info) => {
    meta(info, 'JOB-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 1));
      const parent = (await placed.json()).id as string;
      const { child_id } = mb.seedPendingChild(sub.user_id, sub.account_id!, parent, { symbol: 'RECOV', quantity: 3 });
      expect(orderRow(config, child_id).status).toBe('pending');
      const r = mb.recoverySweep();
      expect(r.recovered).toBeGreaterThanOrEqual(1);
      expect(orderRow(config, child_id).status, 're-placed').toBe('submitted');
      expect(auditByActor(config, 'copy.recovered', sub.user_id)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-JOB-001-002 crash recovery is idempotent — a second sweep does not re-place @jobs @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'JOB-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 1));
      const parent = (await placed.json()).id as string;
      const { child_id } = mb.seedPendingChild(sub.user_id, sub.account_id!, parent, { symbol: 'RECOV2', quantity: 3 });
      mb.recoverySweep();
      const bod = orderRow(config, child_id); // re-placed once
      expect(bod.status).toBe('submitted');
      const again = mb.recoverySweep();
      expect(again.recovered, 'nothing left to recover — no duplicate financial action').toBe(0);
      expect(orderRow(config, child_id).status).toBe('submitted');
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-003-003 retry exhaustion → final REJECTED + copy.retry_failed notification @jobs @api @P1 @recovery', async ({ api, config }, info) => {
    meta(info, 'COPY-003', ['JOB-013']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{ retry_open: '1m', retry_max_attempts: 1 }]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'transient');
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childStatus(config, parent, sub.user_id), { timeout: 20000 }).toBe('retry_pending');
      const cid = childId(config, parent, sub.user_id);
      // still transient on re-place → attempts exhausted (max 1) → final REJECTED
      const r = mb.runRetry(cid);
      expect(orderRow(config, cid).status).toBe('rejected');
      expect(auditByActor(config, 'copy.retry_failed', sub.user_id)).toBeGreaterThanOrEqual(1);
      expect(notifCount(config, sub.user_id, 'copy.retry_failed')).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-013 creating a notification purges that user’s notifications older than 30 days @jobs @api @P2 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    const p = await provisionFanout(api, config, [{}]);
    try {
      const uid = p.subs[0]!.user_id;
      seedNotificationAge(config, uid, 'old.note', 40); // > 30 days → should be purged
      seedNotificationAge(config, uid, 'recent.note', 5); // < 30 days → kept
      expect(notifCount(config, uid)).toBe(2);
      mb.createNotif(uid, 'new.note');
      expect(notifCount(config, uid, 'old.note'), 'stale purged').toBe(0);
      expect(notifCount(config, uid, 'recent.note'), 'recent kept').toBe(1);
      expect(notifCount(config, uid, 'new.note')).toBe(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-JOB-007-004 poller processes accounts independently — one account’s work does not affect another @jobs @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'JOB-007');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}, {}]);
    try {
      const [a, b] = [p.subs[0]!, p.subs[1]!];
      await s.autoLiquidation(api, p.subAccess[0]!, 100); // A will auto-liquidate
      await mb.setPnlSnapshot(a.account_id!, { todays_pl: 150, beginning_day_balance: 1000, equity: 1150 });
      await mb.setPnlSnapshot(b.account_id!, { todays_pl: 0, beginning_day_balance: 1000, equity: 1000 }); // B has no policies → idle skip
      const res = mb.pollerPass([a.account_id!, b.account_id!]);
      expect(res.accounts[a.account_id!]!.auto_liquidated, 'A liquidated').toBe(true);
      expect(res.accounts[a.account_id!]!.copy_enabled).toBe(false);
      expect(res.accounts[b.account_id!]!.copy_enabled, 'B untouched by A').toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-JOB-007-008 poller enforces the daily-loss kill switch from the broker snapshot @jobs @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'JOB-007', ['RISK-001']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await s.dailyLoss(api, p.subAccess[0]!, 50);
      await mb.setPnlSnapshot(sub.account_id!, { todays_pl: -100, beginning_day_balance: 1000, equity: 900 });
      const r = mb.pollerEnforce(sub.account_id!);
      expect(r.copy_enabled, 'copy paused by the poller').toBe(false);
      expect(subSetting(config, sub.user_id, 'pnl_auto_paused_at')).not.toBe('');
      expect(auditByActor(config, 'copy.auto_paused_daily_loss_limit', sub.user_id)).toBeGreaterThanOrEqual(1);
      expect(notifCount(config, sub.user_id, 'copy.auto_paused_daily_loss_limit')).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-JOB-010-005 position reconciler safety — an empty broker read never flattens held positions (idempotent) @jobs @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'JOB-010');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      // give the subscriber a real DB-held position (filled mirror)
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 10));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childId(config, parent, sub.user_id) !== '', { timeout: 20000 }).toBe(true);
      const cid = childId(config, parent, sub.user_id);
      await mb.setOrderStatus(cid, 'filled', 10, 100);
      mb.syncFills(sub.account_id!);
      expect(Number(orderRow(config, cid).filled_quantity)).toBe(10);
      // broker reports NO positions → reconciler must NOT treat empty as flat (safety guard)
      await mb.setPosition(sub.account_id!, []);
      expect(mb.reconcilePosition(sub.account_id!, true).synthetic_closes, 'apply must not flatten on empty read').toBe(0);
      expect(mb.reconcilePosition(sub.account_id!, true).synthetic_closes, 'idempotent — still no writes').toBe(0);
    } finally {
      p.cleanup();
    }
  });

  test('TC-ADMIN-006-001 position reconciler dry-run writes no synthetic closes @jobs @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'ADMIN-006', ['JOB-010']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 10));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childId(config, parent, sub.user_id) !== '', { timeout: 20000 }).toBe(true);
      const cid = childId(config, parent, sub.user_id);
      await mb.setOrderStatus(cid, 'filled', 10, 100);
      mb.syncFills(sub.account_id!);
      await mb.setPosition(sub.account_id!, [{ symbol: 'AAPL', quantity: 4 }]); // divergence (DB 10 vs broker 4)
      expect(mb.reconcilePosition(sub.account_id!, false).synthetic_closes, 'dry-run never writes').toBe(0);
    } finally {
      p.cleanup();
    }
  });

  test('TC-JOB-009-001 EOD sweep flattens a same-day-expiry option in the close window (QA-injected clock) @jobs @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'JOB-009');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await s.eodAutoclose(api, p.subAccess[0]!, true, 15); // opt in
      // a weekday date + EDT offset; option expires the same day (0DTE)
      const d = new Date();
      if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 2);
      else if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
      const day = d.toISOString().slice(0, 10);
      await mb.setPosition(sub.account_id!, [
        { symbol: 'AAPL', quantity: 1, instrument_type: 'option', option_expiry: day, option_strike: 200, option_right: 'call' },
      ]);
      mb.eodTick(`${day}T15:50:00-04:00`); // inside the last 15 minutes before 16:00 ET
      // the EOD worker placed a closing order on the subscriber's account
      expect(await mb.callCount('place', sub.account_id!), 'EOD placed a close for the 0DTE option').toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });
});
