/**
 * AUTHZ-001 — Role & ownership authorization. Manual: manual/test-cases/authz/authz-001__role-ownership.md
 * Adversarial tokens use the shared QA-only secret (isolated local env; never prod).
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { mintAccess, mintExpiredAccess } from '../../../common/jwt.js';

const VALID_ORDER = { symbol: 'AAPL', quantity: 1, order_type: 'market', side: 'buy', instrument_type: 'stock' };
const RANDOM_UUID = '11111111-1111-1111-1111-111111111111';

test.describe('AUTHZ-001 Role & ownership', () => {
  test('TC-AUTHZ-001-001 subscriber blocked from trader-only place-order (403) @auth @api @P1 @security', async ({
    api,
  }, info) => {
    meta(info, 'AUTHZ-001', ['TRADE-001']);
    const { access } = await auth.registerAndLogin(api, makeUser('subscriber'));
    const res = await api.post(`/api/trades?broker_account_id=${RANDOM_UUID}`, { token: access, data: VALID_ORDER });
    expect(res.status()).toBe(403);
    expect((await res.json()).detail).toBe('trader_only');
  });

  test('TC-AUTHZ-001-002 trader blocked from subscriber-only settings (403) @auth @api @P1 @security', async ({
    api,
  }, info) => {
    meta(info, 'AUTHZ-001', ['RISK-001']);
    const { access } = await auth.registerAndLogin(api, makeUser('trader'));
    const res = await api.get('/api/settings/subscriber', { token: access });
    expect(res.status()).toBe(403);
    expect((await res.json()).detail).toBe('subscriber_only');
  });

  test('TC-AUTHZ-001-003 non-admin blocked from admin endpoint (403) @auth @api @P1 @security', async ({
    api,
  }, info) => {
    meta(info, 'AUTHZ-001', ['ADMIN-001']);
    const t = await auth.registerAndLogin(api, makeUser('trader'));
    const s = await auth.registerAndLogin(api, makeUser('subscriber'));
    for (const tok of [t.access, s.access]) {
      const res = await api.get('/api/admin/stats', { token: tok });
      expect(res.status()).toBe(403);
      expect((await res.json()).detail).toBe('admin_only');
    }
  });

  test('TC-AUTHZ-001-004 accessing another user order returns 404 (ownership hidden) @auth @api @P1 @security', async ({
    api,
  }, info) => {
    meta(info, 'AUTHZ-001', ['HIST-001']);
    const { access } = await auth.registerAndLogin(api, makeUser('subscriber'));
    const res = await api.get(`/api/trades/${RANDOM_UUID}`, { token: access });
    expect(res.status()).toBe(404);
  });

  test('TC-AUTHZ-001-005 forged JWT (wrong secret) → 401 @auth @api @P1 @security', async ({ api }, info) => {
    meta(info, 'AUTHZ-001');
    // Sign an admin-role token with a WRONG secret — signature check must reject it.
    const forgedCfg = {
      envName: 'local' as const,
      apiBaseUrl: '',
      frontendUrl: '',
      brokerMode: 'fake' as const,
      jwtSecret: 'a-wrong-secret-not-the-server-one',
      paperAuthorized: false,
    };
    const forged = mintAccess(forgedCfg, RANDOM_UUID, 'admin');
    const res = await api.get('/api/admin/stats', { token: forged });
    expect(res.status()).toBe(401);
  });

  test('TC-AUTHZ-001-006 expired access token → 401 @auth @api @P1 @security', async ({ api, config }, info) => {
    meta(info, 'AUTHZ-001', ['AUTH-003']);
    const expired = mintExpiredAccess(config, RANDOM_UUID, 'subscriber');
    const res = await api.get('/api/auth/me', { token: expired });
    expect(res.status()).toBe(401);
  });

  test('TC-AUTHZ-001-007 missing token → 401 missing_token @auth @api @P1 @prod-safe @negative', async ({
    api,
  }, info) => {
    meta(info, 'AUTHZ-001');
    const res = await api.get('/api/auth/me');
    expect(res.status()).toBe(401);
    expect((await res.json()).detail).toBe('missing_token');
  });

  test('TC-AUTHZ-001-008 FE route-gap: subscriber direct API to trader action is blocked server-side @auth @api @P1 @security', async ({
    api,
  }, info) => {
    meta(info, 'AUTHZ-001', ['TRADE-001']);
    const { access } = await auth.registerAndLogin(api, makeUser('subscriber'));
    // The frontend only hides trader-only nav; the API is the real gate.
    const res = await api.post(`/api/trades?broker_account_id=${RANDOM_UUID}`, { token: access, data: VALID_ORDER });
    expect(res.status()).toBe(403);
  });
});
