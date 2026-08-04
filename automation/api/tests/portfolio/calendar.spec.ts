/**
 * Calendar / P&L — daily realized P&L (seeded FIFO fills), trader view-as with authorization guards,
 * and range/tz validation. LOCAL-QA only. Manual: pnl/pnl-001__calendar.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as cal from '../../clients/positionsApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';

const today = () => new Date().toISOString().slice(0, 10);

test.describe('Calendar / P&L', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-PNL-001-001 daily realized P&L reflects the day’s closed trades @portfolio @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'PNL-001');
    const mb = new MockBroker(config);
    const p = await provisionFanout(api, config, []);
    try {
      mb.seedPnl(p.traderId, p.brokerAccountId, { symbol: 'PNLX', quantity: 10, buy_price: 100, sell_price: 90 }); // -100
      const d = today();
      const res = await cal.calendarPnl(api, p.traderAccess, d, d);
      expect(res.status()).toBe(200);
      const days = await res.json();
      const total = days.reduce((acc: number, x: any) => acc + Number(x.realized_pnl), 0);
      expect(total, 'realized loss of 100 for today').toBe(-100);
    } finally {
      p.cleanup();
    }
  });

  test('TC-PNL-001-002 trader view-as a subscriber is authorized; others are refused @portfolio @api @P1 @security', async ({ api, config }, info) => {
    meta(info, 'PNL-001');
    const p = await provisionFanout(api, config, [{}]);
    const outsider = await auth.registerAndLogin(api, makeUser('subscriber'));
    try {
      const d = today();
      // trader viewing a following subscriber → 200
      expect((await cal.calendarPnl(api, p.traderAccess, d, d, { user_id: p.subs[0]!.user_id })).status()).toBe(200);
      // trader viewing a non-following user → 404 not_a_subscriber
      expect((await cal.calendarPnl(api, p.traderAccess, d, d, { user_id: outsider.id })).status()).toBe(404);
      // a non-trader trying view-as → 403 trader_only
      expect((await cal.calendarPnl(api, p.subAccess[0]!, d, d, { user_id: p.traderId })).status()).toBe(403);
    } finally {
      p.cleanup();
    }
  });

  test('TC-PNL-001-005 range validation — from must be <= to (422) @portfolio @api @P2 @negative', async ({ api, config }, info) => {
    meta(info, 'PNL-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await cal.calendarPnl(api, p.traderAccess, '2026-08-10', '2026-08-01');
      expect(res.status()).toBe(422);
    } finally {
      p.cleanup();
    }
  });
});
