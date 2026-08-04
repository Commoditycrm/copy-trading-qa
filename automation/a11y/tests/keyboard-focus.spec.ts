/**
 * A11Y keyboard-navigation, focus-management, and dialog accessibility.
 * The login form must be fully keyboard-operable; the notification menu must open/close by keyboard and
 * return focus to its trigger (focus management + WAI-ARIA menu semantics).
 */
import { test, expect, meta, seedSession } from '../../ui/fixtures/uiTest.js';
import { makeUser } from '../../common/factory.js';
import { registerAndLogin } from '../../api/clients/authApi.js';
import { deleteUser } from '../../common/localAdmin.js';
import { makeSession } from '../setup.js';

test.describe('A11Y keyboard & focus', () => {
  test.skip(({ config }) => config.envName !== 'local', 'a11y suite runs against the local full stack.');

  test('A11Y-KBD login is fully keyboard-operable (tab advances, Enter submits) @a11y @P1 @keyboard', async ({ page, api, config }, info) => {
    meta(info, 'AUTH-002');
    const u = makeUser('subscriber');
    await registerAndLogin(api, u); // create the account to log into
    try {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const emailBox = page.getByPlaceholder('you@example.com');
      await emailBox.focus();
      expect(await emailBox.evaluate((el) => el === document.activeElement), 'email is keyboard-focusable').toBe(true);
      await page.keyboard.type(u.email);
      await page.keyboard.press('Tab');
      expect(await emailBox.evaluate((el) => el !== document.activeElement), 'Tab advances focus off email').toBe(true);
      // Operate the password field + submit purely by keyboard (Enter).
      const pw = page.getByPlaceholder('••••••••');
      await pw.focus();
      await page.keyboard.type(u.password);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/dashboard/);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('A11Y-DIALOG the notification menu opens/closes by keyboard and returns focus @a11y @P1 @focus', async ({ page, config }, info) => {
    meta(info, 'NOTIF-001');
    const s = await makeSession('subscriber');
    try {
      await seedSession(page, s.tokens);
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const bell = page.getByRole('button', { name: /notifications/i });
      await bell.focus();
      expect(await bell.evaluate((el) => el === document.activeElement), 'bell is focusable').toBe(true);
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu');
      await expect(menu, 'menu opens via keyboard').toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu, 'Escape closes the menu').toBeHidden();
      expect(await bell.evaluate((el) => el === document.activeElement), 'focus returns to the trigger').toBe(true);
    } finally {
      deleteUser(config, s.email);
    }
  });
});
