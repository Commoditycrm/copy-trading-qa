/**
 * SA-007 / DEF-SEC-001 — the SSE stream authenticates via a JWT in the URL QUERY STRING
 * (GET /api/events?token=...), because EventSource cannot set an Authorization header. uvicorn's access
 * log records the full request line, so the bearer token lands in server-side logs in cleartext — a
 * replayable-token-in-logs exposure. This test opens an SSE connection and proves the token appears in the
 * backend access log. Runtime confirmation of baseline §24 (previously Potential for lack of this capture).
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin } from '../../clients/authApi.js';
import { deleteUser } from '../../../common/localAdmin.js';

const compose = resolve(dirname(fileURLToPath(import.meta.url)), '../../../local-stack/docker-compose.qa.yml');

function backendLogContains(needle: string): boolean {
  const out = execSync(`docker compose -f "${compose}" logs backend --since 60s`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return out.includes(needle);
}

/** Open the SSE stream briefly with the token in the query, then close (uvicorn logs the access line). */
async function pokeSse(baseUrl: string, token: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch(`${baseUrl}/api/events?token=${encodeURIComponent(token)}`, { signal: ctrl.signal });
    await r.body?.getReader().read().catch(() => {});
  } catch {
    /* aborted — the request line is already logged */
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}

test.describe('SA-007 SSE token exposure in logs', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Security suite runs against the local stack.');

  test('SA-007 DEF-SEC-001 — the SSE JWT is written to the backend access log in cleartext @security @api @P2 @data-exposure', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001', ['AUTH-002']);
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    try {
      const sig = acct.access.slice(-40); // unique per-token signature tail
      await pokeSse(config.apiBaseUrl, acct.access);
      // The access-log line is flushed on connection close; poll briefly.
      await expect.poll(() => backendLogContains(sig), { timeout: 8000, intervals: [500, 1000, 1500] }).toBe(true);
      // And it is specifically on the /api/events request line (the query-string exposure).
      expect(backendLogContains(`/api/events?token=`), 'token carried in the query, not a header').toBe(true);
    } finally {
      deleteUser(config, u.email);
    }
  });
});
