/**
 * A11Y keyboard-navigation, focus-management, and disclosure accessibility.
 * The login form must be fully keyboard-operable; the notification panel is a button-triggered DISCLOSURE
 * (aria-haspopup + aria-expanded, not an ARIA menu) that must open/close by keyboard, carry an accessible
 * name, and keep focus on its trigger. No product spec requires role="menu" here, so it is not asserted.
 */
import { test, expect, meta, seedSession } from '../../ui/fixtures/uiTest.js';
import { makeUser } from '../../common/factory.js';
import { registerAndLogin } from '../../api/clients/authApi.js';
import { deleteUser } from '../../common/localAdmin.js';
import { makeSession } from '../setup.js';

test.describe('A11Y keyboard & focus', () => {
  test.skip(({ config }) => config.envName !== 'local', 'a11y suite runs against the local full stack.');

  test('A11Y-KBD login is fully keyboard-operable (tab advances, Enter submits) @a11y @P1 @keyboard', async ({
    page,
    api,
    config,
  }, info) => {
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

  test('A11Y-DIALOG the notification disclosure opens/closes by keyboard and keeps focus on its trigger @a11y @P1 @focus', async ({
    page,
    config,
  }, info) => {
    meta(info, 'NOTIF-001');
    const s = await makeSession('subscriber');
    try {
      await seedSession(page, s.tokens);
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const bell = page.getByRole('button', { name: /notifications/i });
      // Accessible name + disclosure semantics (a labelled popup trigger, collapsed to start).
      await expect(bell, 'the trigger has an accessible name').toHaveAccessibleName(/notifications/i);
      await expect(bell).toHaveAttribute('aria-haspopup', 'true');
      await expect(bell).toHaveAttribute('aria-expanded', 'false');

      await bell.focus();
      expect(await bell.evaluate((el) => el === document.activeElement), 'trigger is keyboard-focusable').toBe(true);

      // Enter opens the disclosure: aria-expanded flips and the panel content appears.
      await page.keyboard.press('Enter');
      await expect(bell, 'aria-expanded reflects the open panel').toHaveAttribute('aria-expanded', 'true');
      const panel = page.getByRole('link', { name: /view all notifications/i }); // present only while open
      await expect(panel, 'the panel opens via keyboard').toBeVisible();

      // Escape closes it and collapses the trigger.
      await page.keyboard.press('Escape');
      await expect(bell, 'Escape collapses the disclosure').toHaveAttribute('aria-expanded', 'false');
      await expect(panel, 'Escape closes the panel').toBeHidden();

      // Focus is on the trigger after close (it never left the button — a valid non-modal disclosure).
      expect(await bell.evaluate((el) => el === document.activeElement), 'focus stays on the trigger').toBe(true);
    } finally {
      deleteUser(config, s.email);
    }
  });
});
