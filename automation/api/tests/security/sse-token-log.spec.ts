/**
 * SA-007 / DEF-SEC-001 — the SSE stream authenticates via a JWT in the URL QUERY STRING
 * (GET /api/events?token=...), because EventSource cannot set an Authorization header. uvicorn's access
 * log records the full request line, so the bearer token WOULD land in server-side logs in cleartext.
 * The app redacts it (main.py `_RedactAccessTokenFilter`: `token=<jwt>` → `token=REDACTED`).
 * This test opens an SSE connection and proves the real token NEVER appears in the access log and that the
 * request line is redacted instead. DEF-SEC-001: Fixed — Verified.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin } from '../../clients/authApi.js';
import { deleteUser } from '../../../common/localAdmin.js';

const compose = resolve(dirname(fileURLToPath(import.meta.url)), '../../../local-stack/docker-compose.qa.yml');

function backendLog(sinceSec = 60): string {
  return execSync(`docker compose -f "${compose}" logs backend --since ${sinceSec}s`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Open the SSE stream briefly with the token in the query, then close (uvicorn logs the access line). */
async function pokeSse(baseUrl: string, token: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch(`${baseUrl}/api/events?token=${encodeURIComponent(token)}`, { signal: ctrl.signal });
    await r.body
      ?.getReader()
      .read()
      .catch(() => {});
  } catch {
    /* aborted — the request line is already logged */
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}

test.describe('SA-007 SSE token exposure in logs', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Security suite runs against the local stack.');

  test('SA-007 DEF-SEC-001 — the SSE JWT is redacted from the backend access log @security @api @P2 @data-exposure', async ({
    api,
    config,
  }, info) => {
    meta(info, 'NOTIF-001', ['AUTH-002']);
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    try {
      const sig = acct.access.slice(-40); // unique per-token signature tail
      await pokeSse(config.apiBaseUrl, acct.access);
      // Wait until the /api/events access line has been flushed (it carries the redaction marker).
      await expect
        .poll(() => backendLog().includes('token=REDACTED'), { timeout: 8000, intervals: [500, 1000, 1500] })
        .toBe(true);
      const log = backendLog();
      // DEF-SEC-001 fixed: the real token value is NEVER written in cleartext …
      expect(log.includes(sig), 'the real SSE JWT must not appear in the access log').toBe(false);
      // … and the /api/events request line is present but redacted.
      expect(log.includes('/api/events?token=REDACTED'), 'the token query is logged as REDACTED').toBe(true);
      await info.attach('sse-access-line', {
        body: (log.split('\n').find((l) => l.includes('/api/events')) ?? '(not found)').trim(),
        contentType: 'text/plain',
      });
    } finally {
      deleteUser(config, u.email);
    }
  });
});
