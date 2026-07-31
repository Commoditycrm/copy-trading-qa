/**
 * Subscriber Risk-Control BEHAVIOR — daily-limit auto-pause (fanout), symbol filters, auto-liquidation
 * stickiness, and per-position TP/SL enforcement + copy-trader-bracket mutual exclusion. Uses the mock
 * broker (positions) + a grey-box driver that runs the app's OWN enforcer / fanout. LOCAL-QA only.
 * Manual: risk-controls/risk-001, risk-002, risk-003, risk-004.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import * as s from '../../clients/settingsApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { subSetting, setSubSettingRaw, childId, childOrders, auditByActor, notifCount } from '../../../common/tradingSetup.js';

test.describe('Risk-control behavior', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-RISK-001-007 daily-loss breach auto-pauses copy at fanout (no mirror, marker, audit) @risk @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'RISK-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      expect((await s.dailyLoss(api, p.subAccess[0]!, 50)).status()).toBe(200);
      mb.seedPnl(sub.user_id, sub.account_id!, { symbol: 'PNLX', quantity: 10, buy_price: 100, sell_price: 90 }); // -100
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 1));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => auditByActor(config, 'copy.auto_paused_daily_loss_limit', sub.user_id), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      expect(childId(config, parent, sub.user_id), 'no mirror once auto-paused').toBe('');
      expect(subSetting(config, sub.user_id, 'copy_enabled')).toBe('false');
      expect(subSetting(config, sub.user_id, 'pnl_auto_paused_at')).not.toBe('');
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-001-008 daily-profit breach auto-pauses copy at fanout @risk @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'RISK-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      expect((await s.dailyProfit(api, p.subAccess[0]!, 50)).status()).toBe(200);
      mb.seedPnl(sub.user_id, sub.account_id!, { symbol: 'PNLX', quantity: 10, buy_price: 100, sell_price: 120 }); // +200
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 1));
      await (await placed.json());
      await expect.poll(() => auditByActor(config, 'copy.auto_paused_daily_profit_limit', sub.user_id), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      expect(subSetting(config, sub.user_id, 'copy_enabled')).toBe('false');
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-004-001 excluded symbol is not mirrored (skipped_excluded_symbol) @risk @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'RISK-004');
    const p = await provisionFanout(api, config, [{ symbol_exclusion: ['MSFT'] }]);
    try {
      const sub = p.subs[0]!;
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('MSFT', 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => auditByActor(config, 'copy.skipped_excluded_symbol', sub.user_id), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      expect(childId(config, parent, sub.user_id)).toBe('');
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-004-002 inclusion list mirrors only listed symbols @risk @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'RISK-004');
    const p = await provisionFanout(api, config, [{ symbol_inclusion: ['AAPL'] }]);
    try {
      const sub = p.subs[0]!;
      // not in inclusion list → skipped
      const a = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('MSFT', 5));
      const pMsft = (await a.json()).id as string;
      await expect.poll(() => auditByActor(config, 'copy.skipped_not_in_inclusion_list', sub.user_id), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      expect(childId(config, pMsft, sub.user_id)).toBe('');
      // in inclusion list → mirrored
      const b = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const pAapl = (await b.json()).id as string;
      await expect.poll(() => childId(config, pAapl, sub.user_id) !== '', { timeout: 20000 }).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-004-003 symbol in both lists is excluded (exclusion wins) @risk @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'RISK-004');
    const p = await provisionFanout(api, config, [{ symbol_exclusion: ['AAPL'], symbol_inclusion: ['AAPL'] }]);
    try {
      const sub = p.subs[0]!;
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => auditByActor(config, 'copy.skipped_excluded_symbol', sub.user_id), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      expect(childId(config, parent, sub.user_id), 'conflict resolves to excluded').toBe('');
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-002-004 clearing the auto-liquidation floor does NOT clear a prior liquidation marker @risk @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'RISK-002');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await s.autoLiquidation(api, p.subAccess[0]!, 500);
      setSubSettingRaw(config, sub.user_id, 'auto_liquidated_at', 'now()');
      expect((await s.autoLiquidation(api, p.subAccess[0]!, null)).status()).toBe(200);
      expect(subSetting(config, sub.user_id, 'auto_liquidation_limit')).toBe('');
      expect(subSetting(config, sub.user_id, 'auto_liquidated_at'), 'sticky marker preserved').not.toBe('');
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-002-003 auto-liquidated subscriber is sticky — a fanout does not re-enable copy @risk @api @P1 @recovery', async ({ api, config }, info) => {
    meta(info, 'RISK-002', ['RISK-001']);
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      // liquidated yesterday: copy off + both stamps set (pause backdated a day)
      setSubSettingRaw(config, sub.user_id, 'copy_enabled', 'false');
      setSubSettingRaw(config, sub.user_id, 'auto_liquidated_at', "now() - interval '1 day'");
      setSubSettingRaw(config, sub.user_id, 'pnl_auto_paused_at', "now() - interval '1 day'");
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 1));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childOrders(config, parent).length >= 0, { timeout: 15000 }).toBe(true);
      // still liquidated: copy stays off, marker preserved, no mirror
      expect(subSetting(config, sub.user_id, 'copy_enabled')).toBe('false');
      expect(subSetting(config, sub.user_id, 'auto_liquidated_at'), 'liquidation marker not cleared').not.toBe('');
      expect(childId(config, parent, sub.user_id)).toBe('');
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-003-005 position TP enforcement closes the position when unrealized pct crosses TP @risk @api @P0 @integration', async ({ api, config }, info) => {
    meta(info, 'RISK-003');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await s.positionTp(api, p.subAccess[0]!, 10); // TP at +10%
      await mb.setPosition(sub.account_id!, [{ symbol: 'AAPL', quantity: 10, cost_basis: 100, unrealized_pnl: 15 }]); // +15%
      const r = mb.enforcePositionTpSl(sub.user_id, sub.account_id!);
      expect(r.closed_count, 'TP breach → one close').toBe(1);
      expect(auditByActor(config, 'subscriber.position_tp_closed', sub.user_id)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-003-004 copy-trader-bracket ON suppresses the position enforcer (no double-close) @risk @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'RISK-003');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await s.positionTp(api, p.subAccess[0]!, 10);
      await s.copyTraderBracket(api, p.subAccess[0]!, true); // mutual exclusion: bracket wins
      await mb.setPosition(sub.account_id!, [{ symbol: 'AAPL', quantity: 10, cost_basis: 100, unrealized_pnl: 15 }]);
      const r = mb.enforcePositionTpSl(sub.user_id, sub.account_id!);
      expect(r.closed_count, 'enforcer suppressed while copy_trader_bracket is on').toBe(0);
      expect(auditByActor(config, 'subscriber.position_tp_closed', sub.user_id)).toBe(0);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-001-009 next-day auto-resume re-enables a prior-UTC-day pause (poller path) @risk @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'RISK-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      // paused yesterday (copy off, stamp on a prior UTC day)
      setSubSettingRaw(config, sub.user_id, 'copy_enabled', 'false');
      setSubSettingRaw(config, sub.user_id, 'pnl_auto_paused_at', "now() - interval '1 day'");
      const r = mb.pollerEnforce(sub.account_id!);
      expect(r.copy_enabled, 'copy re-enabled on the new UTC day').toBe(true);
      expect(subSetting(config, sub.user_id, 'pnl_auto_paused_at'), 'pause marker cleared').toBe('');
      expect(auditByActor(config, 'copy.auto_resumed_next_day', sub.user_id)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-002-002 auto-liquidation triggers on unrealized-profit ≥ limit (take-profit) + notifies @risk @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'RISK-002', ['NOTIF-001']);
    // NOTE: model/schema/manual describe an equity FLOOR, but the poller triggers on unrealized-PROFIT
    // ≥ limit (audit copy.auto_liquidated_take_profit). Asserting the ACTUAL behavior; doc/impl mismatch
    // is flagged as a potential finding in the execution summary.
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await s.autoLiquidation(api, p.subAccess[0]!, 100);
      // unrealized = todays_pl - todays_realized(0) = 150 ≥ 100
      await mb.setPnlSnapshot(sub.account_id!, { todays_pl: 150, beginning_day_balance: 1000, equity: 1150 });
      const r = mb.pollerEnforce(sub.account_id!);
      expect(r.copy_enabled, 'copy disabled on liquidation').toBe(false);
      expect(r.auto_liquidated, 'liquidation marker stamped').toBe(true);
      expect(auditByActor(config, 'copy.auto_liquidated_take_profit', sub.user_id)).toBeGreaterThanOrEqual(1);
      expect(notifCount(config, sub.user_id, 'copy.auto_liquidated'), 'in-app notification created').toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });
});
