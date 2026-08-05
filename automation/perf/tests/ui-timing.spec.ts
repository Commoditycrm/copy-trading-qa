/**
 * PERF UI timings — Navigation Timing (TTFB / DOMContentLoaded / load) + web vitals (LCP, CLS) via
 * PerformanceObserver, for the key pages. Playwright drives Chromium; authenticated pages use a seeded
 * localStorage session (setup only). Two samples per page (median reported in the summary).
 */
import { test, expect, meta, seedSession } from '../../ui/fixtures/uiTest.js';
import { deleteUser } from '../../common/localAdmin.js';
import { makeSession } from '../../a11y/setup.js';
import type { Page } from '@playwright/test';

async function timings(page: Page): Promise<Record<string, number>> {
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(600); // let LCP/CLS settle
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformanceEntry[];
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1]!.startTime : 0;
    let cls = 0;
    for (const e of performance.getEntriesByType('layout-shift') as any[]) if (!e.hadRecentInput) cls += e.value;
    return {
      ttfb_ms: Math.round(nav?.responseStart ?? 0),
      dcl_ms: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      load_ms: Math.round(nav?.loadEventEnd ?? 0),
      lcp_ms: Math.round(lcp),
      cls: Math.round(cls * 1000) / 1000,
    };
  });
}

test.describe('PERF UI timings', () => {
  test.skip(({ config }) => config.envName !== 'local', 'perf runs against the local full stack.');

  test('TC-PERF-002-001 page-load timings + web vitals @perf @P2 @ui', async ({ page, config }, info) => {
    meta(info, 'PERF-001', ['DASH-001']);
    test.setTimeout(180_000);
    const sub = await makeSession('subscriber');
    const admin = await makeSession('subscriber', true);
    const results: Record<string, Record<string, number>> = {};
    const measure = async (label: string, path: string, tokens?: { access: string; refresh: string }) => {
      const samples: Record<string, number>[] = [];
      for (let i = 0; i < 2; i++) {
        if (tokens) await seedSession(page, tokens);
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        samples.push(await timings(page));
      }
      // report the second (warm) sample
      results[label] = samples[1]!;
      // eslint-disable-next-line no-console
      console.log(`PERF_UI|${label}|${JSON.stringify(samples[1])}`);
    };
    try {
      await measure('login', '/login');
      await measure('dashboard', '/dashboard', sub.tokens);
      await measure('trade-panel', '/trade-panel', sub.tokens);
      await measure('positions', '/positions', sub.tokens);
      await measure('admin-users', '/admin/users', admin.tokens);
    } finally {
      deleteUser(config, sub.email);
      deleteUser(config, admin.email);
    }
    await info.attach('ui-timings.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
    expect(Object.keys(results).length).toBe(5);
  });
});
