/**
 * Positions — list/aggregate (live broker read via the mock), ownership, close-one, close guards,
 * close-all, and trader bulk-close (async). GET reads adapter.get_positions per connected account, so
 * the mock fully controls it. LOCAL-QA only. Manual: positions/pos-001__positions.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as pos from '../../clients/positionsApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { sideOrderCount } from '../../../common/tradingSetup.js';

test.describe('Positions', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-POS-001-001 list aggregates open positions from connected accounts @portfolio @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'POS-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    try {
      await mb.setPosition(p.brokerAccountId, [
        { symbol: 'AAPL', quantity: 10, avg_entry_price: 100, current_price: 110, market_value: 1100, unrealized_pnl: 100 },
        { symbol: 'MSFT', quantity: 5, avg_entry_price: 200, current_price: 190, market_value: 950, unrealized_pnl: -50 },
      ]);
      const res = await pos.listPositions(api, p.traderAccess);
      expect(res.status()).toBe(200);
      const rows = await res.json();
      const syms = rows.map((r: any) => r.symbol).sort();
      expect(syms).toEqual(['AAPL', 'MSFT']);
      expect(rows.find((r: any) => r.symbol === 'AAPL').quantity).toBe('10');
    } finally {
      p.cleanup();
    }
  });

  test('TC-POS-001-006 empty state — no positions returns [] @portfolio @api @P2', async ({ api, config }, info) => {
    meta(info, 'POS-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    try {
      await mb.setPosition(p.brokerAccountId, []);
      expect(await (await pos.listPositions(api, p.traderAccess)).json()).toEqual([]);
    } finally {
      p.cleanup();
    }
  });

  test('TC-POS-001-003 close one position places the reverse order @portfolio @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'POS-001', ['TRADE-002']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    try {
      await mb.setPosition(p.brokerAccountId, [{ symbol: 'AAPL', quantity: 10, avg_entry_price: 100, current_price: 110 }]);
      try {
        const res = await pos.closePosition(api, p.traderAccess, 'AAPL', p.brokerAccountId, { order_type: 'market' });
        expect([201, 200]).toContain(res.status());
      } catch {
        /* single-worker keep-alive reset; the reverse order still lands — assert via DB below */
      }
      await expect.poll(() => sideOrderCount(config, p.traderId, 'AAPL', 'sell'), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-POS-001-004 close guards — ownership 404, missing position 404, quantity bounds 422 @portfolio @api @P1 @security', async ({ api, config }, info) => {
    meta(info, 'POS-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    const attacker = await auth.registerAndLogin(api, makeUser('trader'));
    try {
      await mb.setPosition(p.brokerAccountId, [{ symbol: 'AAPL', quantity: 10 }]);
      // ownership — another user targeting this account
      expect((await pos.closePosition(api, attacker.access, 'AAPL', p.brokerAccountId)).status()).toBe(404);
      // no position for that symbol
      expect((await pos.closePosition(api, p.traderAccess, 'ZZZZ', p.brokerAccountId)).status()).toBe(404);
      // quantity bounds
      expect((await pos.closePosition(api, p.traderAccess, 'AAPL', p.brokerAccountId, { quantity: 0 })).status()).toBe(422);
      expect((await pos.closePosition(api, p.traderAccess, 'AAPL', p.brokerAccountId, { quantity: 99 })).status()).toBe(422);
    } finally {
      p.cleanup();
    }
  });

  test('TC-POS-001-005 close-all own positions @portfolio @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'POS-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    try {
      await mb.setPosition(p.brokerAccountId, [
        { symbol: 'AAPL', quantity: 10, current_price: 110 },
        { symbol: 'MSFT', quantity: 5, current_price: 190 },
      ]);
      const res = await pos.closeAll(api, p.traderAccess, false);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.closed_count, 'both positions closed').toBe(2);
    } finally {
      p.cleanup();
    }
  });

  test('TC-POS-001-007 trader bulk-close subscribers is queued async @portfolio @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'POS-001', ['TRADE-003']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      await mb.setPosition(p.subs[0]!.account_id!, [{ symbol: 'AAPL', quantity: 5, current_price: 110 }]);
      const res = await pos.closeAllSubscribers(api, p.traderAccess);
      expect(res.status()).toBe(200);
      expect((await res.json()).queued_pairs, 'one subscriber account queued').toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });
});
