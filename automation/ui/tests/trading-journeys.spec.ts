/**
 * WF-10 / WF-11 — Trader places a market order through the trade panel, and the subscriber receives a
 * mirror. The order is placed through the browser; the fanout runs in the worker; the mirror is asserted
 * in the DB (the subscriber account holds the mirrored order). Accounts + follow/copy are API-seeded.
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { TradePanelPage, TradesPage } from '../pages/trading.js';
import { provisionFanout } from '../../api/tests/trading/helpers.js';
import { sideOrderCount } from '../../common/tradingSetup.js';

test.describe('WF-10/11 Trade + mirror (UI)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-WF-10-001 trader places a market order via the trade panel and the subscriber is mirrored @ui @P1 @integration', async ({ page, config, api }, info) => {
    meta(info, 'WF-10', ['TRADE-001', 'COPY-001']);
    const p = await provisionFanout(api, config, [{}]);
    try {
      await seedSession(page, { access: p.traderAccess, refresh: p.traderAccess });
      const panel = new TradePanelPage(page);
      await panel.open();
      // enter a simple stock market order and submit through the UI (switches to the STOCKS tab).
      await panel.placeMarketBuy('AAPL', 5);

      // trader's own order shows up in Order History (UI).
      const trades = new TradesPage(page);
      await trades.open();
      await expect(page.getByText('AAPL').first()).toBeVisible({ timeout: 15000 });

      // the subscriber receives a mirror (fanout → worker); asserted in the DB.
      await expect
        .poll(() => sideOrderCount(config, p.subs[0]!.user_id, 'AAPL', 'buy'), { timeout: 25000 })
        .toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });
});
