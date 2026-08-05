/**
 * PERF SSE concurrency — TC-PERF-003-001. Opens 20/50/100 concurrent SSE clients against
 * GET /api/events?token=, measuring connect success and time-to-first-frame (the `: connected` comment).
 * Verifies the single-worker backend accepts many concurrent long-lived streams. Connections are closed
 * after first frame (bounded). SAFETY: synthetic user, local-qa only.
 */
import { test, expect, meta } from '../../common/fixtures.js';
import { makeUser } from '../../common/factory.js';
import { registerAndLogin } from '../../api/clients/authApi.js';
import { deleteUser } from '../../common/localAdmin.js';

const LEVELS = [20, 50, 100];

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!);
}

async function openOne(base: string, token: string): Promise<number | null> {
  const ctrl = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(`${base}/api/events?token=${encodeURIComponent(token)}`, { signal: ctrl.signal });
    if (!r.ok || !r.body) return null;
    const reader = r.body.getReader();
    await reader.read(); // first frame (server sends ": connected" promptly)
    const ttff = Date.now() - t0;
    await reader.cancel().catch(() => {});
    return ttff;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}

test.describe('PERF SSE concurrency', () => {
  test.skip(({ config }) => config.envName !== 'local', 'perf runs against the local full stack.');

  test('TC-PERF-003-001 concurrent SSE clients (20/50/100) @perf @P1 @sse', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001', ['PERF-001']);
    test.setTimeout(180_000);
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    const rows: Record<string, unknown>[] = [];
    try {
      for (const N of LEVELS) {
        const results = await Promise.all(Array.from({ length: N }, () => openOne(config.apiBaseUrl, acct.access)));
        const ok = results.filter((x): x is number => x !== null).sort((a, b) => a - b);
        const row = {
          clients: N,
          connected: ok.length,
          failed: N - ok.length,
          ttff_p50_ms: pct(ok, 50),
          ttff_p95_ms: pct(ok, 95),
          ttff_max_ms: ok.length ? ok[ok.length - 1] : 0,
        };
        rows.push(row);
        // eslint-disable-next-line no-console
        console.log('PERF_SSE|' + JSON.stringify(row));
      }
    } finally {
      deleteUser(config, u.email);
    }
    await info.attach('sse-concurrency.json', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
    // sanity: the large majority of connections succeed at every level
    for (const r of rows)
      expect(r.connected as number, `connect rate @${r.clients}`).toBeGreaterThanOrEqual(
        Math.floor((r.clients as number) * 0.9),
      );
  });
});
