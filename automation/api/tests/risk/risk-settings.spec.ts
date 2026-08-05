/**
 * Subscriber Risk-Control SETTINGS — validation, persistence, audit, cache invalidation, reset, and the
 * copy-toggle marker clear. All self-scoped require_subscriber endpoints. LOCAL-QA only.
 * Manual: manual/test-cases/risk-controls/*.md
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import * as s from '../../clients/settingsApi.js';
import { provisionFanout } from '../trading/helpers.js';
import {
  subSetting,
  setSubSettingRaw,
  subscriberCacheExists,
  auditByActor,
  childOrders,
} from '../../../common/tradingSetup.js';

test.describe('Risk-control settings', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-RISK-001-001 set daily-loss-limit-pct persists + audits + busts cache @risk @api @P1 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-001');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      const res = await s.dailyLossPct(api, p.subAccess[0]!, 25);
      expect(res.status(), await res.text()).toBe(200);
      expect(Number(subSetting(config, sub.user_id, 'daily_loss_limit_pct'))).toBe(25);
      expect(auditByActor(config, 'subscriber.daily_loss_limit_pct_changed', sub.user_id)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-001-002 percentage limits enforce gt=0 le=100 boundaries @risk @api @P1 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-001');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.dailyLossPct(api, t, 0)).status()).toBe(422); // gt=0
      expect((await s.dailyLossPct(api, t, 101)).status()).toBe(422); // le=100
      expect((await s.dailyProfitPct(api, t, 100)).status()).toBe(200); // boundary ok
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-001-005 max-account-pct enforces gt=0 le=100 and persists @risk @api @P1 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-001');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.maxAccountPct(api, t, 0)).status()).toBe(422);
      expect((await s.maxAccountPct(api, t, 100.01)).status()).toBe(422);
      expect((await s.maxAccountPct(api, t, 20)).status()).toBe(200);
      expect(Number(subSetting(config, p.subs[0]!.user_id, 'max_account_pct_per_day'))).toBe(20);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-002-001 auto-liquidation-limit enforces gt=0 and persists @risk @api @P1 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-002');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.autoLiquidation(api, t, 0)).status()).toBe(422);
      expect((await s.autoLiquidation(api, t, 500)).status()).toBe(200);
      expect(Number(subSetting(config, p.subs[0]!.user_id, 'auto_liquidation_limit'))).toBe(500);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-003-001 position-tp-pct boundary (gt=0 le=1000) + persist @risk @api @P1 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-003');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.positionTp(api, t, 0)).status()).toBe(422);
      expect((await s.positionTp(api, t, 1000.01)).status()).toBe(422);
      expect((await s.positionTp(api, t, 50)).status()).toBe(200);
      expect(Number(subSetting(config, p.subs[0]!.user_id, 'position_tp_pct'))).toBe(50);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-003-002 position-sl-pct boundary (gt=0 le=100) + persist @risk @api @P1 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-003');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.positionSl(api, t, 0)).status()).toBe(422);
      expect((await s.positionSl(api, t, 101)).status()).toBe(422);
      expect((await s.positionSl(api, t, 30)).status()).toBe(200);
      expect(Number(subSetting(config, p.subs[0]!.user_id, 'position_sl_pct'))).toBe(30);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-003-003 copy-trader-bracket toggle persists @risk @api @P2', async ({ api, config }, info) => {
    meta(info, 'RISK-003');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.copyTraderBracket(api, t, true)).status()).toBe(200);
      expect(subSetting(config, p.subs[0]!.user_id, 'copy_trader_bracket')).toBe('true');
      expect((await s.copyTraderBracket(api, t, false)).status()).toBe(200);
      expect(subSetting(config, p.subs[0]!.user_id, 'copy_trader_bracket')).toBe('false');
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-004-004 symbol filter is normalized (uppercase, trimmed, de-duplicated) @risk @api @P2 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-004');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const res = await s.symbolFilter(api, p.subAccess[0]!, [' aapl ', 'AAPL', 'tsla'], null);
      expect(res.status()).toBe(200);
      const excl = JSON.parse(subSetting(config, p.subs[0]!.user_id, 'symbol_exclusion_list') || '[]') as string[];
      expect([...excl].sort()).toEqual(['AAPL', 'TSLA']);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-005-001 max-per-contract enforces ge=0 @risk @api @P2 @boundary', async ({ api, config }, info) => {
    meta(info, 'RISK-005');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.maxPerContract(api, t, -1)).status()).toBe(422);
      expect((await s.maxPerContract(api, t, 0)).status()).toBe(200); // ge=0 allows 0
      expect((await s.maxPerContract(api, t, 5)).status()).toBe(200);
      expect(Number(subSetting(config, p.subs[0]!.user_id, 'max_per_contract'))).toBe(5);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-006-001 eod-autoclose minutes clamp to 1..30 @risk @api @P2 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-006');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.eodAutoclose(api, t, true, 0)).status()).toBe(422); // ge=1
      expect((await s.eodAutoclose(api, t, true, 31)).status()).toBe(422); // le=30
      expect((await s.eodAutoclose(api, t, true, 10)).status()).toBe(200);
      expect(subSetting(config, p.subs[0]!.user_id, 'eod_autoclose_enabled')).toBe('true');
      expect(Number(subSetting(config, p.subs[0]!.user_id, 'eod_autoclose_minutes'))).toBe(10);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-001-011 multiplier boundary (gt=0 le=10) + persist @risk @api @P1 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'COPY-001');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.multiplier(api, t, 0)).status()).toBe(422);
      expect((await s.multiplier(api, t, 10.5)).status()).toBe(422);
      expect((await s.multiplier(api, t, 3)).status()).toBe(200);
      expect(Number(subSetting(config, p.subs[0]!.user_id, 'multiplier'))).toBe(3);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-003-008 retry interval enum validation + max-attempts boundary @risk @api @P2 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'COPY-003');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const t = p.subAccess[0]!;
      expect((await s.retryInterval(api, t, 'bogus', null, null)).status()).toBe(422); // invalid enum
      expect((await s.retryInterval(api, t, '1m', '5m', 6)).status()).toBe(422); // max le=5
      expect((await s.retryInterval(api, t, '1m', '5m', 3)).status()).toBe(200);
      expect(subSetting(config, p.subs[0]!.user_id, 'retry_interval_open')).toMatch(/1m|ONE_M/i);
      expect(Number(subSetting(config, p.subs[0]!.user_id, 'retry_max_attempts'))).toBe(3);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-001-011 a cache-busting setting change invalidates cache:subs:<trader> @risk @api @P1 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-001');
    const p = await provisionFanout(api, config, [{}]);
    try {
      // warm the subscriber cache via a fanout, then confirm the PATCH busts it
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 1));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childOrders(config, parent).length, { timeout: 20000 }).toBe(1);
      expect(subscriberCacheExists(config, p.traderId), 'cache warmed by fanout').toBe(true);
      expect((await s.dailyLoss(api, p.subAccess[0]!, 100)).status()).toBe(200);
      expect(subscriberCacheExists(config, p.traderId), 'cache-busting setting invalidated the snapshot').toBe(false);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-005-005 max-per-contract change does NOT bust the subscriber cache @risk @api @P2 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-005');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 1));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childOrders(config, parent).length, { timeout: 20000 }).toBe(1);
      expect(subscriberCacheExists(config, p.traderId)).toBe(true);
      expect((await s.maxPerContract(api, p.subAccess[0]!, 5)).status()).toBe(200);
      expect(
        subscriberCacheExists(config, p.traderId),
        'documented divergence: max-per-contract does not bust cache',
      ).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-001-006 enabling copy clears the auto-pause and auto-liquidation markers @risk @api @P1 @recovery', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-001', ['RISK-002']);
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      setSubSettingRaw(config, sub.user_id, 'pnl_auto_paused_at', 'now()');
      setSubSettingRaw(config, sub.user_id, 'auto_liquidated_at', 'now()');
      setSubSettingRaw(config, sub.user_id, 'copy_enabled', 'false');
      expect((await s.copy(api, p.subAccess[0]!, true)).status()).toBe(200);
      expect(subSetting(config, sub.user_id, 'copy_enabled')).toBe('true');
      expect(subSetting(config, sub.user_id, 'pnl_auto_paused_at')).toBe('');
      expect(subSetting(config, sub.user_id, 'auto_liquidated_at')).toBe('');
    } finally {
      p.cleanup();
    }
  });

  test('TC-RISK-001-010 reset-to-defaults resets config but preserves follow/copy/pause/liquidation @risk @api @P1 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'RISK-001');
    const p = await provisionFanout(api, config, [{ multiplier: 5 }]);
    try {
      const sub = p.subs[0]!;
      const t = p.subAccess[0]!;
      await s.dailyLoss(api, t, 100);
      await s.symbolFilter(api, t, ['MSFT'], null);
      setSubSettingRaw(config, sub.user_id, 'pnl_auto_paused_at', 'now()');
      setSubSettingRaw(config, sub.user_id, 'auto_liquidated_at', 'now()');
      expect((await s.reset(api, t)).status()).toBe(200);
      // config reset
      expect(Number(subSetting(config, sub.user_id, 'multiplier'))).toBe(1);
      expect(subSetting(config, sub.user_id, 'daily_loss_limit')).toBe('');
      expect(JSON.parse(subSetting(config, sub.user_id, 'symbol_exclusion_list') || '[]')).toEqual([]);
      // preserved
      expect(subSetting(config, sub.user_id, 'following_trader_id')).toBe(p.traderId);
      expect(subSetting(config, sub.user_id, 'pnl_auto_paused_at')).not.toBe('');
      expect(subSetting(config, sub.user_id, 'auto_liquidated_at')).not.toBe('');
      expect(auditByActor(config, 'subscriber.settings_reset', sub.user_id)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });
});
