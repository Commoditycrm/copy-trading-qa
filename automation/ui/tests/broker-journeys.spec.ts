/**
 * WF-06 — Broker connections UI.
 * The fake broker is NOT connectable through the UI (the picker only offers Alpaca/SnapTrade/IBKR, all
 * requiring real creds/an external portal), so a real successful connect + the UI disconnect of a fake
 * account remain out of scope. DEF-UI-001 (FIXED — Verified): /brokers used to throw an unhandled
 * client-side exception and white-screen whenever the user held a broker whose name isn't in the frontend
 * BROKER_META map (e.g. `fake`); `brokerMeta()` now returns a neutral fallback, so the page renders. TC-WF-
 * 06-002 asserts the fixed state (page mounts, fake account listed, no uncaught error).
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { BrokersPage } from '../pages/brokers.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser } from '../../common/localAdmin.js';
import * as authApi from '../../api/clients/authApi.js';
import { provisionFanout } from '../../api/tests/trading/helpers.js';

test.describe('WF-06 Broker connections (UI)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-WF-06-001 broker page shows the connect picker for a user with no broker @ui @P1 @integration', async ({
    page,
    config,
    api,
  }, info) => {
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

  test('TC-WF-06-002 DEF-UI-001 — /brokers renders for an unmapped (fake) broker account @ui @P2 @regression', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-06', ['BRK-001']);
    // A user holding a `fake` broker account (API-seeded) used to crash the page: BrokerAvatar derefed
    // BROKER_META['fake'].name → client-side exception. DEF-UI-001 fixed: brokerMeta now falls back for an
    // unmapped broker, so the page renders. Verify no white-screen / uncaught error and the page mounts.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const p = await provisionFanout(api, config, []);
    try {
      await seedSession(page, { access: p.traderAccess, refresh: p.traderAccess });
      const brokers = new BrokersPage(page);
      await page.goto('/brokers', { waitUntil: 'domcontentloaded' });
      // The real page mounts (its heading is visible) …
      await expect(brokers.pageHeading).toBeVisible();
      // … the Next error boundary never shows …
      await expect(page.getByText(/application error|client-side exception/i)).toHaveCount(0);
      // … the seeded fake account is listed via the neutral fallback label "Fake"
      // (proves BrokerAvatar rendered the unmapped broker instead of crashing on it) …
      await expect(page.getByText(/fake/i).first()).toBeVisible();
      // … and nothing threw to the window.
      expect(errors, 'no uncaught client-side exception on /brokers').toEqual([]);
    } finally {
      p.cleanup();
    }
  });
});
