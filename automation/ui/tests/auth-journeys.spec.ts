/**
 * WF-01..04 — Authentication user journeys through the real Next.js UI (Chromium).
 * The business action (register / login / reset / verify / logout) is performed in the browser.
 * API is used only for token retrieval (email sink) and cleanup. Namespaced @qa.kopyya.dev users only.
 */
import { test, expect, meta } from '../fixtures/uiTest.js';
import { RegisterPage, LoginPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from '../pages/auth.js';
import { AppShell } from '../pages/shell.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser } from '../../common/localAdmin.js';
import { tokenForSubject } from '../../common/emailSink.js';
import * as authApi from '../../api/clients/authApi.js';

// Policy-compliant password distinct from the generated registration password (for the reset journey).
const NEW_STRONG_PW = 'QaReset!2026xZ';

test.describe('WF Auth journeys (UI)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-WF-01-001 subscriber registers and lands authenticated @ui @P1 @integration', async ({
    page,
    config,
  }, info) => {
    meta(info, 'WF-01', ['AUTH-001']);
    const u = makeUser('subscriber');
    const reg = new RegisterPage(page);
    try {
      await reg.open();
      await reg.register(u);
      // Registration auto-authenticates → app shell (dashboard).
      await page.waitForURL(/\/dashboard/);
      await expect(new AppShell(page).signOut).toBeVisible();
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-WF-01-002 trader registers with business name @ui @P1 @integration', async ({ page, config }, info) => {
    meta(info, 'WF-01', ['AUTH-001']);
    const u = makeUser('trader');
    const reg = new RegisterPage(page);
    try {
      await reg.open();
      await reg.register(u);
      await page.waitForURL(/\/dashboard/);
      await expect(new AppShell(page).signOut).toBeVisible();
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-WF-02-001 login then logout returns to /login @ui @P1 @integration', async ({ page, config }, info) => {
    meta(info, 'WF-02', ['AUTH-002']);
    const u = makeUser('subscriber');
    const reg = new RegisterPage(page);
    const login = new LoginPage(page);
    try {
      // setup: create the account through the UI, then sign out so we can test a clean login.
      await reg.open();
      await reg.register(u);
      await page.waitForURL(/\/dashboard/);
      await new AppShell(page).logout();
      await page.waitForURL(/\/login/);
      // action under test: log in through the browser.
      await login.login(u.email, u.password);
      await page.waitForURL(/\/dashboard/);
      // logout again to assert the session clears.
      await new AppShell(page).logout();
      await page.waitForURL(/\/login/);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-WF-02-003 an invalid/expired session is redirected to /login @ui @P1 @security', async ({
    page,
    config,
  }, info) => {
    meta(info, 'WF-02', ['AUTH-002', 'AUTHZ-001']);
    const { seedExpiredSession } = await import('../fixtures/uiTest.js');
    await seedExpiredSession(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/);
    await expect(new LoginPage(page).submit).toBeVisible();
  });

  test('TC-WF-03-001 password reset via UI, then login with the new password @ui @P1 @integration', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-03', ['AUTH-004']);
    const u = makeUser('subscriber');
    // setup via API so we have the user id (reset JWT carries only `sub`, no email claim).
    const acct = await authApi.registerAndLogin(api, u);
    try {
      // request a reset link through the UI, grab the token from the local email sink by user id.
      const forgot = new ForgotPasswordPage(page);
      await forgot.open();
      await forgot.request(u.email);
      await expect.poll(() => tokenForSubject({ userId: acct.id, type: 'reset' }), { timeout: 10000 }).not.toBeNull();
      const token = tokenForSubject({ userId: acct.id, type: 'reset' })!;

      const reset = new ResetPasswordPage(page);
      await reset.open(token);
      await reset.reset(NEW_STRONG_PW);
      await page.waitForURL(/\/login/);

      // action under test: log in with the new password through the browser.
      await new LoginPage(page).login(u.email, NEW_STRONG_PW);
      await page.waitForURL(/\/dashboard/);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-WF-04-001 email verification link confirms the account @ui @P2 @integration', async ({
    page,
    config,
  }, info) => {
    meta(info, 'WF-04', ['AUTH-005']);
    const u = makeUser('subscriber');
    const reg = new RegisterPage(page);
    try {
      await reg.open();
      await reg.register(u);
      await page.waitForURL(/\/dashboard/);

      await expect.poll(() => tokenForSubject({ email: u.email, type: 'verify' }), { timeout: 10000 }).not.toBeNull();
      const token = tokenForSubject({ email: u.email, type: 'verify' })!;

      const verify = new VerifyEmailPage(page);
      await verify.open(token);
      await expect(verify.success()).toBeVisible();
    } finally {
      deleteUser(config, u.email);
    }
  });
});
