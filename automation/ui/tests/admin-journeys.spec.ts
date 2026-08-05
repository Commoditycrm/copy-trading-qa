/**
 * WF-22 — Admin operations through the real admin UI (Chromium).
 *
 * DEF-ADMIN-001 handling: the shipped DB stores the user_role label lowercase 'admin' which the ORM can't
 * read, so every admin route 500s. These admin UI tests run AFTER the documented QA-only disposable-DB
 * remediation (promoteToAdmin → ensureAdminEnumLabel adds the correct 'ADMIN' label). The app repo is NOT
 * modified. TC-WF-22-009 is the control proving a broken-label admin still 500s (unremediated behavior).
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { LoginPage } from '../pages/auth.js';
import { AdminPage } from '../pages/admin.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser, promoteToAdmin, promoteToBrokenAdmin, isActive } from '../../common/localAdmin.js';
import { mintAccess } from '../../common/jwt.js';
import * as authApi from '../../api/clients/authApi.js';
import * as trades from '../../api/clients/tradesApi.js';
import { marketOrder } from '../../api/clients/tradesApi.js';
import { provisionFanout } from '../../api/tests/trading/helpers.js';
import { MockBroker } from '../../common/mockBrokerClient.js';
import { notifCount } from '../../common/tradingSetup.js';

async function seedAdmin(api: any, config: any, page: any): Promise<{ email: string; id: string }> {
  const u = makeUser('subscriber');
  const acct = await authApi.registerAndLogin(api, u);
  promoteToAdmin(config, u.email); // QA remediation: ensures the ADMIN enum label + promotes
  await seedSession(page, { access: mintAccess(config, acct.id, 'admin'), refresh: acct.refresh });
  return { email: u.email, id: acct.id };
}

test.describe('WF-22 Admin operations (UI, post-remediation)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-WF-22-001 admin logs in through the browser and reaches the admin dashboard @ui @P1 @integration', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-22', ['ADMIN-002', 'AUTH-002']);
    const u = makeUser('subscriber');
    const acct = await authApi.registerAndLogin(api, u);
    promoteToAdmin(config, u.email);
    void acct;
    const admin = new AdminPage(page);
    try {
      // action under test: real UI login as an admin → root routes admin to /admin.
      const login = new LoginPage(page);
      await login.open();
      await login.login(u.email, u.password);
      await page.waitForURL(/\/admin/);
      await expect(admin.overviewHeading).toBeVisible();
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-WF-22-004 admin activates/deactivates a user from the Users screen @ui @P1 @integration', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-22', ['ADMIN-001']);
    const admin = await seedAdmin(api, config, page);
    const targetU = makeUser('trader');
    const target = await authApi.registerAndLogin(api, targetU);
    void target;
    const ap = new AdminPage(page);
    try {
      await ap.openUsers();
      await expect(ap.usersHeading).toBeVisible();
      await ap.search.fill(targetU.email);
      const row = ap.userRow(targetU.email);
      await expect(row).toBeVisible();
      // deactivate through the UI, assert both UI status and DB state.
      await row.getByRole('button', { name: /deactivate/i }).click();
      await expect(row.getByText('Inactive')).toBeVisible();
      await expect.poll(() => isActive(config, targetU.email)).toBe(false);
      // reactivate.
      await row.getByRole('button', { name: /^activate/i }).click();
      await expect(row.getByText('Active', { exact: true })).toBeVisible();
      await expect.poll(() => isActive(config, targetU.email)).toBe(true);
    } finally {
      deleteUser(config, admin.email);
      deleteUser(config, targetU.email);
    }
  });

  test('TC-WF-22-005 admin sees a rejected mirror order on the Rejected screen @ui @P2 @integration', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-22', ['ADMIN-003']);
    const admin = await seedAdmin(api, config, page);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    const ap = new AdminPage(page);
    try {
      await mb.setPlaceOrderResult(p.subs[0]!.account_id!, 'reject', { reason: 'asset not tradable' });
      await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      await expect
        .poll(() => notifCount(config, p.subs[0]!.user_id, 'copy.rejected'), { timeout: 20000 })
        .toBeGreaterThanOrEqual(1);

      await ap.openRejected();
      await expect(ap.rejectedHeading).toBeVisible();
      await expect(page.getByText('AAPL').first()).toBeVisible();
    } finally {
      deleteUser(config, admin.email);
      p.cleanup();
    }
  });

  test('TC-WF-22-009 CONTROL — an unremediated (lowercase-label) admin cannot load /admin (500) @ui @P0 @defect', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-22', ['ADMIN-001']);
    // DEF-ADMIN-001: without the QA enum remediation the admin's own row is un-deserializable → /api/auth/me 500s.
    const u = makeUser('subscriber');
    const acct = await authApi.registerAndLogin(api, u);
    promoteToBrokenAdmin(config, u.email); // shipped lowercase 'admin' label — no remediation
    try {
      // proof at the API layer that the shipped state 500s.
      const me = await api.get('/api/auth/me', { token: mintAccess(config, acct.id, 'admin') });
      expect(me.status()).toBe(500);
      // and in the browser the admin dashboard never renders.
      await seedSession(page, { access: mintAccess(config, acct.id, 'admin'), refresh: acct.refresh });
      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      await expect(new AdminPage(page).overviewHeading).toHaveCount(0);
    } finally {
      deleteUser(config, u.email);
    }
  });
});
