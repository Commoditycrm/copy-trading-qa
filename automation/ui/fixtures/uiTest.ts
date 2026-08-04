/**
 * UI E2E fixture — extends the shared API test with browser-session helpers.
 * Auth is localStorage-based (`trading-app:access` / `trading-app:refresh`), so a session can be seeded
 * via the API for SETUP while the action under test is still driven through the browser.
 */
import { test as base, expect, meta } from '../../common/fixtures.js';
import type { Page } from '@playwright/test';

const ACCESS_KEY = 'trading-app:access';
const REFRESH_KEY = 'trading-app:refresh';

/** Seed tokens into localStorage before any document loads (setup-only — not the action under test). */
export async function seedSession(page: Page, tokens: { access: string; refresh: string }): Promise<void> {
  await page.addInitScript(
    ([a, r, ak, rk]) => {
      try {
        localStorage.setItem(ak, a);
        localStorage.setItem(rk, r);
      } catch {
        /* origin not ready yet — addInitScript re-runs on the next navigation */
      }
    },
    [tokens.access, tokens.refresh, ACCESS_KEY, REFRESH_KEY] as const,
  );
}

/** Seed deliberately-invalid tokens to exercise session-expiry redirects. */
export async function seedExpiredSession(page: Page): Promise<void> {
  await seedSession(page, { access: 'expired.invalid.token', refresh: 'expired.invalid.refresh' });
}

export const test = base;
export { expect, meta };
