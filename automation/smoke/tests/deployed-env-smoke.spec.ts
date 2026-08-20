/**
 * Deployed-environment read-only smoke (@prod-safe) — runs against ANY DEPLOYED env (QA or prod), NOT the
 * disposable local stack. Environment-neutral: relative paths hit whatever QA_BASE_URL points at, so the SAME
 * file serves every deployed target — only the workflow supplies the URL:
 *   • QA   → qa-smoke.yml   (QA_BASE_URL = https://test.kopyya.com)
 *   • prod → prod-smoke.yml (PROD_BASE_URL = https://kopyya.com, gated/authorized)
 *
 * HTTP-only, zero writes, no broker, no DB access: verifies the deployed target is up and behaving (health,
 * public pages serve, auth is enforced, schema not leaked, edge posture). Never mutates data — safe on a live env.
 */
import { test, expect, meta } from '../../common/fixtures.js';
import { assertProdSafe } from '../../common/safety.js';

const PROTECTED_GET = ['/api/auth/me', '/api/positions', '/api/notifications', '/api/trades'];
const PUBLIC_PAGES = ['/', '/login', '/register', '/terms', '/privacy'];

test.describe('QA Lightsail smoke (deployed test.kopyya.com, read-only)', () => {
  test('QA-SMOKE-001 API health returns ok @prod-safe @smoke @api @P0', async ({ api, config }, info) => {
    meta(info, 'HEALTH');
    assertProdSafe(config);
    const res = await api.get('/api/health');
    expect(res.status(), 'health endpoint responds 200').toBe(200);
    const body = await res.json();
    expect(body.ok, 'health payload ok:true').toBe(true);
  });

  test('QA-SMOKE-002 public pages are served @prod-safe @smoke @ui @P1', async ({ api, config }, info) => {
    meta(info, 'DASH-001');
    assertProdSafe(config);
    for (const p of PUBLIC_PAGES) {
      const res = await api.get(p);
      expect(res.status(), `public page ${p} serves 200`).toBe(200);
    }
  });

  test('QA-SMOKE-003 protected API endpoints require authentication (401) @prod-safe @smoke @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTHZ-001');
    assertProdSafe(config);
    for (const p of PROTECTED_GET) {
      const res = await api.get(p);
      expect(res.status(), `${p} rejects an unauthenticated request`).toBe(401);
      const detail = String((await res.json())?.detail ?? '');
      expect(detail, `${p} returns a missing-token error, not data`).toContain('missing_token');
    }
  });

  test('QA-SMOKE-004 the SSE stream refuses an unauthenticated connection @prod-safe @smoke @api @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'NOTIF-001');
    assertProdSafe(config);
    const res = await api.get('/api/events');
    expect(res.status(), 'no anonymous SSE stream').toBeGreaterThanOrEqual(400);
  });

  test('QA-SMOKE-005 the OpenAPI schema is not publicly exposed @prod-safe @smoke @api @P2 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'SA-006');
    assertProdSafe(config);
    for (const p of ['/api/openapi.json', '/openapi.json', '/docs', '/redoc']) {
      const res = await api.get(p);
      expect(res.status(), `${p} is not served publicly`).not.toBe(200);
    }
  });

  test('QA-SMOKE-006 web-security headers observation (SA-005) @prod-safe @smoke @api @P2 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'SA-005');
    assertProdSafe(config);
    const res = await api.get('/login');
    expect(res.status()).toBe(200);
    const h = res.headers();
    const missing = [
      'content-security-policy',
      'strict-transport-security',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
    ].filter((k) => !h[k]);
    if (missing.length) {
      info.annotations.push({
        type: 'potential_defect',
        description: `SA-005: missing edge security headers on QA: ${missing.join(', ')}${h['x-powered-by'] ? ` (and X-Powered-By leaked: ${h['x-powered-by']})` : ''}`,
      });
    }
    await info.attach('security-headers', {
      body: JSON.stringify({ missing, xPoweredBy: h['x-powered-by'] ?? null }, null, 2),
      contentType: 'application/json',
    });
    // Non-blocking: the deployed edge is up and serving; header hardening is tracked as SA-005.
    expect(res.status(), 'edge serves the page').toBe(200);
  });
});
