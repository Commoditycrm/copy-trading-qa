/**
 * WF-22 — Admin operations through the real admin UI (Chromium).
 *
 * DEF-ADMIN-001 (FIXED — Verified): migration `a3f9d1c7e2b8` renames the user_role label 'admin' → 'ADMIN'
 * (the NAME the ORM reads), so a real admin row deserializes and every /api/admin/* route works on a clean
 * migrated deploy — no QA-only remediation required (promoteToAdmin's ensureAdminEnumLabel is now an
 * idempotent no-op). TC-WF-22-009 asserts the fixed state: the migrated enum exposes ADMIN and admin
 * endpoints return 200.
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { LoginPage } from '../pages/auth.js';
import { AdminPage } from '../pages/admin.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser, promoteToAdmin, isActive, userRoleEnumLabels } from '../../common/localAdmin.js';
import { mintAccess } from '../../common/jwt.js';
import * as authApi from '../../api/clients/authApi.js';
import * as trades from '../../api/clients/tradesApi.js';
import { marketOrder } from '../../api/clients/tradesApi.js';
import { provisionFanout } from '../../api/tests/trading/helpers.js';
import { MockBroker } from '../../common/mockBrokerClient.js';
import { childForUser } from '../../common/tradingSetup.js';

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
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'reject', { reason: 'asset not tradable' });
      const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const entryId = (await res.json()).id as string;
      // Ground truth: wait until the subscriber's mirror child is COMMITTED as rejected — the exact row the
      // admin rejected-orders query returns. The old copy.rejected-notification wait could win the race
      // before the order-status commit, so the screen's one-shot mount fetch sometimes loaded an empty set.
      await expect
        .poll(() => childForUser(config, entryId, sub.user_id)?.status ?? 'none', { timeout: 20000 })
        .toBe('rejected');

      await ap.openRejected(); // mounts AFTER the row is committed → the initial fetch includes it
      await expect(ap.rejectedHeading).toBeVisible();
      // The rejected row for THIS subscriber (scoped by their unique email → parallel-safe), on AAPL.
      const row = ap.rejectedRowFor(sub.email).first();
      await expect(row).toBeVisible();
      await expect(row).toContainText('AAPL');
    } finally {
      deleteUser(config, admin.email);
      p.cleanup();
    }
  });

  test('TC-WF-22-009 DEF-ADMIN-001 — fresh migrated DB exposes ADMIN and admin endpoints return 200 @ui @P0 @regression', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-22', ['ADMIN-001']);
    // DEF-ADMIN-001 fixed: migration a3f9d1c7e2b8 renames the user_role label 'admin' → 'ADMIN' (the NAME
    // the ORM reads), so a real admin row deserializes and /api/admin/* works on a clean deploy — no
    // QA-only remediation needed. Assert the migrated enum, an admin API 200, and the dashboard rendering.
    const labels = userRoleEnumLabels(config);
    expect(labels, 'migrated user_role enum contains ADMIN').toContain('ADMIN');
    expect(labels, 'the pre-fix lowercase label is gone').not.toContain('admin');

    const admin = await seedAdmin(api, config, page); // promotes to the real 'ADMIN' label + seeds the session
    try {
      // admin API returns 200 (was the pre-fix 500 on an un-deserializable admin row) …
      const res = await api.get('/api/admin/stats', { token: mintAccess(config, admin.id, 'admin') });
      expect(res.status(), 'admin endpoint returns 200 on a fresh migrated DB').toBe(200);
      // … and the admin dashboard renders in the browser.
      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      await expect(new AdminPage(page).overviewHeading).toBeVisible();
    } finally {
      deleteUser(config, admin.email);
    }
  });
});
