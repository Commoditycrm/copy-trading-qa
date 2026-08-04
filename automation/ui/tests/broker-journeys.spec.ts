/**
 * WF-06 — Broker connections UI.
 * The fake broker is NOT connectable through the UI (the picker only offers Alpaca/SnapTrade/IBKR, all
 * requiring real creds/an external portal), so a real successful connect + the UI disconnect of a fake
 * account are BLOCKED — see DEF-UI-001: the /brokers page throws an unhandled client-side exception and
 * white-screens whenever the user holds a broker account whose name isn't in the frontend BROKER_META map
 * (e.g. `fake`), because BrokerAvatar dereferences BROKER_META[broker].name with no fallback.
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { BrokersPage } from '../pages/brokers.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser } from '../../common/localAdmin.js';
import * as authApi from '../../api/clients/authApi.js';
import { provisionFanout } from '../../api/tests/trading/helpers.js';

test.describe('WF-06 Broker connections (UI)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-WF-06-001 broker page shows the connect picker for a user with no broker @ui @P1 @integration', async ({ page, config, api }, info) => {
    meta(info, 'WF-06', ['BRK-001']);
    const u = makeUser('trader');
    const acct = await authApi.registerAndLogin(api, u);
    try {
      await seedSession(page, { access: acct.access, refresh: acct.refresh });
      const brokers = new BrokersPage(page);
      await brokers.open();
      await expect(brokers.pageHeading).toBeVisible();
      // the connect surface (real brokers only — the fake broker is intentionally not offered here).
      await expect(brokers.tile('Alpaca')).toBeVisible();
      await expect(brokers.tile('IBKR')).toBeVisible();
      await expect(brokers.connect).toBeVisible();
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-WF-06-002 DEF-UI-001 — /brokers white-screens for an unmapped (fake) broker account @ui @P2 @defect', async ({ page, config, api }, info) => {
    meta(info, 'WF-06', ['BRK-001']);
    // A user holding a `fake` broker account (API-seeded) crashes the page: BrokerAvatar derefs
    // BROKER_META['fake'].name → client-side exception. Documents the shipped defect (reproduced here + in 16-001 attempt).
    const p = await provisionFanout(api, config, []);
    try {
      await seedSession(page, { access: p.traderAccess, refresh: p.traderAccess });
      await page.goto('/brokers', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/application error|client-side exception/i)).toBeVisible();
      await expect(new BrokersPage(page).pageHeading).toHaveCount(0); // the real page never renders
    } finally {
      p.cleanup();
    }
  });
});
