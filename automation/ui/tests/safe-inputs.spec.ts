/**
 * SELL-ALL safe numeric inputs (TC-SELL-006-35) — the shared PercentInput guard (components/PercentInput.tsx)
 * blocks negatives across every number field: the -, +, e, E keys are ignored and a pasted leading '-' is
 * stripped, while a valid positive number is left exactly as typed (900 stays 900, never clamped). Verified on
 * the subscriber "Daily loss limit threshold" field (a PercentInput — the risk-limit cards only render for a
 * subscriber, not a fresh trader). Manual:
 * manual/test-cases/sell-all/sell-all-snapshot-reentry.md. LOCAL-QA only.
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { makeUser } from '../../common/factory.js';
import { registerAndLogin } from '../../api/clients/authApi.js';
import { deleteUser } from '../../common/localAdmin.js';

/** Feature detection: 404 = the sell-all build isn't present → skip; 401/other = routes exist → run. */
async function sellAllPresent(api: any): Promise<boolean> {
  const res = await api.get('/api/positions/snapshots/latest');
  return res.status() !== 404;
}

test.describe('Safe numeric inputs (PercentInput guard)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-SELL-006-35 number fields block negatives and never clamp a valid positive @sell-all @ui @P1 @security', async ({
    page,
    api,
    config,
  }, info) => {
    meta(info, 'SELL-006');
    test.skip(!(await sellAllPresent(api)), 'Sell-All feature not present in this build.');
    const u = makeUser('subscriber'); // risk-limit cards (PercentInput) render for a subscriber, not a fresh trader
    const acct = await registerAndLogin(api, u);
    try {
      await seedSession(page, { access: acct.access, refresh: acct.refresh });
      await page.goto('/settings', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      // "Daily loss limit threshold" is a PercentInput (shared guard).
      const field = page.getByRole('spinbutton', { name: /daily loss limit threshold/i }).first();
      await expect(field, 'a PercentInput risk-limit field renders on Settings').toBeVisible();

      // 1) a valid positive is left exactly as typed (never clamped).
      await field.click();
      await field.fill('');
      await field.pressSequentially('900');
      await expect(field, '900 stays 900 — not clamped').toHaveValue('900');

      // 2) the minus key is ignored (never inserts a '-').
      await field.fill('');
      await field.focus();
      await page.keyboard.press('-');
      await page.keyboard.type('5');
      await expect(field, 'minus key blocked → 5').toHaveValue('5');

      // 3) a pasted leading '-' is stripped by onChange.
      await field.fill('-42');
      await expect(field, "pasted '-' stripped → 42").toHaveValue('42');
    } finally {
      deleteUser(config, u.email);
    }
  });
});
