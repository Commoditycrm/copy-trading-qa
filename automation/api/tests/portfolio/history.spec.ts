/**
 * Trade history — list, paginated page (search/sort/limit/offset + total), stats scopes, get-one
 * ownership. DB-seeded via placed orders. LOCAL-QA only. Manual: history/hist-001__trades-history-export.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import * as hist from '../../clients/positionsApi.js';
import { provisionFanout } from '../trading/helpers.js';

async function seedOrders(api: any, p: any, symbols: string[]) {
  const ids: string[] = [];
  for (const s of symbols)
    ids.push((await (await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(s, 3))).json()).id);
  return ids;
}

test.describe('Trade history', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-HIST-001-001 list returns the caller’s trades (newest first, limit honoured) @portfolio @api @P1 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'HIST-001');
    const p = await provisionFanout(api, config, []);
    try {
      await seedOrders(api, p, ['AAA', 'BBB', 'CCC']);
      const all = await (await hist.trades(api, p.traderAccess)).json();
      expect(all.length).toBeGreaterThanOrEqual(3);
      const limited = await (await hist.trades(api, p.traderAccess, { limit: 2 })).json();
      expect(limited.length).toBe(2);
    } finally {
      p.cleanup();
    }
  });

  test('TC-HIST-001-002 paged trades — envelope total, limit/offset, symbol search @portfolio @api @P1 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'HIST-001');
    const p = await provisionFanout(api, config, []);
    try {
      await seedOrders(api, p, ['AAA', 'BBB', 'CCC']);
      const page1 = await (await hist.tradesPage(api, p.traderAccess, { limit: 2, offset: 0 })).json();
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBeGreaterThanOrEqual(3);
      const search = await (await hist.tradesPage(api, p.traderAccess, { search: 'AAA' })).json();
      expect(search.items.every((o: any) => o.symbol === 'AAA')).toBe(true);
      expect(search.items.length).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-HIST-001-003 stats returns all vs mine scope counts @portfolio @api @P1', async ({ api, config }, info) => {
    meta(info, 'HIST-001');
    const p = await provisionFanout(api, config, []);
    try {
      await seedOrders(api, p, ['AAA', 'BBB', 'CCC']);
      const stats = await (await hist.tradesStats(api, p.traderAccess)).json();
      expect(stats.all.total).toBeGreaterThanOrEqual(3);
      expect(stats.mine).toBeTruthy();
      expect(typeof stats.all.working).toBe('number');
    } finally {
      p.cleanup();
    }
  });

  test('TC-HIST-001-004 get-one is owner-only (404 for another user) @portfolio @api @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'HIST-001');
    const p = await provisionFanout(api, config, []);
    const attacker = await auth.registerAndLogin(api, makeUser('trader'));
    try {
      const [id] = await seedOrders(api, p, ['AAA']);
      expect((await hist.getTrade(api, p.traderAccess, id!)).status()).toBe(200);
      expect((await hist.getTrade(api, attacker.access, id!)).status()).toBe(404);
    } finally {
      p.cleanup();
    }
  });
});
