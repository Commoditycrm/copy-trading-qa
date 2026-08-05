/**
 * SA-005 — web-security headers, CORS isolation, and tech-disclosure.
 * CORS must not reflect an arbitrary origin (real control — asserted green). The application layer emits
 * no CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy and leaks framework banners; in
 * production these are expected at the Caddy edge (not in the repo), so this is recorded as a POTENTIAL
 * (SA-005) with the runtime posture captured, not a Confirmed app defect.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin } from '../../clients/authApi.js';
import { deleteUser } from '../../../common/localAdmin.js';

const SEC_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
];

test.describe('SA-005 web security headers & CORS', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Security suite runs against the local stack.');

  test('SA-005 CORS does not reflect an arbitrary origin (isolation control) @security @api @P1 @headers', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-002');
    const res = await api.get('/api/health', { headers: { Origin: 'https://evil.example' } });
    const allow = res.headers()['access-control-allow-origin'];
    expect(allow, 'evil origin must not be reflected').not.toBe('https://evil.example');
    expect(allow ?? '', 'no wildcard-with-anything').not.toBe('*');
  });

  test('SA-005 POTENTIAL — the app layer emits no security headers (edge-dependent, capture posture) @security @api @P2 @headers', async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTH-002');
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    try {
      const res = await api.get('/api/auth/me', { token: acct.access });
      const h = res.headers();
      const present = SEC_HEADERS.filter((k) => k in h);
      // Documented current posture: none present at the app layer. If the app starts setting them, this
      // flips and prompts a review (and the SA-005 potential can be closed). Prod Caddy edge is unverified.
      expect(present, `app-layer security headers present: ${present.join(', ') || 'none'}`).toEqual([]);
      // Framework/tech-disclosure banners (minor): server header is uvicorn; no X-Powered-By on the API.
      expect(h['server'] ?? '', 'server banner recorded').toContain('uvicorn');
    } finally {
      deleteUser(config, u.email);
    }
  });
});
