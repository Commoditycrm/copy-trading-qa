/**
 * WF route authorization — unauthenticated and wrong-role redirects, driven through the browser.
 * Sessions are seeded via API (localStorage tokens); the navigation + redirect is the UI behavior under test.
 * Guards are client-side (no middleware): unauth → /login, admin ↔ non-admin shells cross-redirect.
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { LoginPage } from '../pages/auth.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser, promoteToAdmin } from '../../common/localAdmin.js';
import { mintAccess } from '../../common/jwt.js';
import * as authApi from '../../api/clients/authApi.js';

test.describe('WF route authorization (UI)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-WF-02-002 unauthenticated access to a protected route redirects to /login @ui @P1 @security', async ({ page }, info) => {
    meta(info, 'WF-02', ['AUTHZ-001']);
    await page.goto('/positions', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/);
    await expect(new LoginPage(page).submit).toBeVisible();
  });

  test('TC-WF-22-002 a subscriber is redirected away from /admin @ui @P1 @security', async ({ page, config, api }, info) => {
    meta(info, 'WF-22', ['AUTHZ-001', 'ADMIN-001']);
    const u = makeUser('subscriber');
    const acct = await authApi.registerAndLogin(api, u);
    try {
      await seedSession(page, { access: acct.access, refresh: acct.refresh });
      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      // admin layout replaces to "/" for non-admins → lands on /dashboard, never renders /admin.
      await page.waitForURL((url) => !url.pathname.startsWith('/admin'));
      await expect(page).not.toHaveURL(/\/admin/);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-WF-22-003 an admin is redirected from the app shell to /admin @ui @P1 @security', async ({ page, config, api }, info) => {
    meta(info, 'WF-22', ['AUTHZ-001', 'ADMIN-001']);
    const u = makeUser('subscriber');
    const acct = await authApi.registerAndLogin(api, u);
    promoteToAdmin(config, u.email); // ensures the ADMIN enum label + promotes (QA remediation for DEF-ADMIN-001)
    try {
      await seedSession(page, { access: mintAccess(config, acct.id, 'admin'), refresh: acct.refresh });
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/admin/);
    } finally {
      deleteUser(config, u.email);
    }
  });
});
