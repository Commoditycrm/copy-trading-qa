/**
 * A11Y responsive reflow — WCAG 1.4.10. Content must reflow without a horizontal scrollbar on a mobile
 * viewport, at 320px width, and at ~200% zoom (emulated by halving the desktop viewport). Verified on a
 * public page (/login) and an authenticated page (/dashboard).
 */
import { test, expect, meta, seedSession } from '../../ui/fixtures/uiTest.js';
import { deleteUser } from '../../common/localAdmin.js';
import { makeSession } from '../setup.js';

/** No horizontal scroll: the document is not wider than the viewport (small rounding tolerance). */
async function noHorizontalScroll(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
}

test.describe('A11Y responsive reflow', () => {
  test.skip(({ config }) => config.envName !== 'local', 'a11y suite runs against the local full stack.');

  const cases: Array<{ label: string; w: number; h: number }> = [
    { label: 'mobile 375×812', w: 375, h: 812 },
    { label: '320px reflow', w: 320, h: 800 },
    { label: '~200% zoom (640×512)', w: 640, h: 512 },
  ];

  for (const c of cases) {
    test(`A11Y-REFLOW /login reflows with no horizontal scroll @ ${c.label} @a11y @P1 @responsive`, async ({ page }, info) => {
      meta(info, 'AUTH-002');
      await page.setViewportSize({ width: c.w, height: c.h });
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(await noHorizontalScroll(page), `horizontal scroll at ${c.label}`).toBe(true);
      // the primary action stays reachable (visible) after reflow
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    });
  }

  test('A11Y-REFLOW /dashboard reflows at 320px with no horizontal scroll @a11y @P1 @responsive', async ({ page, config }, info) => {
    meta(info, 'AUTH-001');
    const s = await makeSession('subscriber');
    try {
      await page.setViewportSize({ width: 320, height: 800 });
      await seedSession(page, s.tokens);
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(await noHorizontalScroll(page), 'dashboard horizontal scroll at 320px').toBe(true);
    } finally {
      deleteUser(config, s.email);
    }
  });
});
