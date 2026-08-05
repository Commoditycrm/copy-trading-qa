/**
 * SA-006 — sensitive-data exposure sweep. Across a spread of authenticated endpoints for a broker-connected
 * tenant, no response may contain broker credentials, encryption blobs, provider secrets, or bearer tokens.
 * Complements the field-level redaction TCs (broker phase) with a cross-endpoint invariant.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { provisionFanout } from '../trading/helpers.js';

// Substrings that must never appear in a non-auth response body.
const SECRET_MARKERS = [
  'encrypted_credentials',
  'api_secret',
  'secret_key',
  'signing_key',
  'access_token_secret',
  'private_key',
  'gAAAAA', // Fernet ciphertext prefix (credentials at rest)
  'SG.', // SendGrid key prefix
  'eyJhbGciOi', // a JWT header — no bearer token should be echoed in resource payloads
];

test.describe('SA-006 sensitive-data exposure', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Security suite runs against the local stack.');

  test('SA-006 no broker credentials / secrets / tokens appear in resource responses @security @api @P0 @data-exposure', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001', ['NOTIF-001', 'POS-001']);
    const p = await provisionFanout(api, config, [{}]);
    try {
      const endpoints = [
        { m: 'get', url: '/api/auth/me', token: p.traderAccess },
        { m: 'get', url: '/api/brokers', token: p.traderAccess },
        { m: 'get', url: '/api/notifications?limit=50', token: p.subAccess[0]! },
        { m: 'get', url: `/api/positions?broker_account_id=${p.brokerAccountId}`, token: p.traderAccess },
      ];
      for (const e of endpoints) {
        const res = await api.get(e.url, { token: e.token });
        expect(res.status(), `${e.url} reachable`).toBeLessThan(500);
        const body = await res.text();
        for (const marker of SECRET_MARKERS) {
          expect(body.includes(marker), `${e.url} must not leak "${marker}"`).toBe(false);
        }
      }
    } finally {
      p.cleanup();
    }
  });
});
