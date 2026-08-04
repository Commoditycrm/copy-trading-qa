/**
 * SA-001 — JWT / authentication hardening matrix against a protected endpoint (GET /api/auth/me).
 * Every malformed / forged / wrong-type / stale-subject token must be rejected with 401 and NEVER a 500,
 * and the error body must not leak a stack trace. SA-002 — a deactivated user's still-valid token is rejected.
 * All synthetic @qa.kopyya.dev users; cleaned in finally. Independent security assessment → SA-* IDs.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import jwt from 'jsonwebtoken';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin } from '../../clients/authApi.js';
import { mintAccess, mintExpiredAccess, mintWrongType } from '../../../common/jwt.js';
import { deleteUser, deactivateUser } from '../../../common/localAdmin.js';

const PROTECTED = '/api/auth/me';

function noStackTrace(body: unknown): boolean {
  const s = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return !/Traceback|File \"\/app|line \d+, in |sqlalchemy|psycopg|at Object\.|\.py\"/.test(s);
}

test.describe('SA-001 auth token hardening', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Security suite runs against the local stack.');

  test('SA-001 every malformed/forged/stale token is 401 (never 500) with no stack-trace leak @security @api @P0 @auth', async ({ api, config }, info) => {
    meta(info, 'AUTHZ-001', ['AUTH-002']);
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    const secret = config.jwtSecret!;
    const realUuid = acct.id;
    const ghostUuid = '00000000-0000-4000-8000-000000000000'; // valid UUID, no such user

    const cases: Array<{ name: string; token: string | null }> = [
      { name: 'no token', token: null },
      { name: 'garbage string', token: 'not.a.jwt' },
      { name: 'valid shape, wrong signature', token: jwt.sign({ sub: realUuid, role: 'subscriber', type: 'access' }, 'wrong-secret', { algorithm: 'HS256', expiresIn: 600 }) },
      { name: 'alg=none', token: jwt.sign({ sub: realUuid, role: 'subscriber', type: 'access' }, '', { algorithm: 'none' }) },
      { name: 'expired', token: mintExpiredAccess(config, realUuid, 'subscriber') },
      { name: 'wrong type (refresh as access)', token: mintWrongType(config, realUuid, 'refresh') },
      { name: 'missing sub', token: jwt.sign({ role: 'subscriber', type: 'access' }, secret, { algorithm: 'HS256', expiresIn: 600 }) },
      { name: 'privilege claim admin (forged role)', token: jwt.sign({ sub: realUuid, role: 'admin', type: 'access' }, secret, { algorithm: 'HS256', expiresIn: 600 }) },
      { name: 'non-existent sub (valid uuid)', token: mintAccess(config, ghostUuid, 'subscriber') },
    ];
    try {
      for (const c of cases) {
        const res = await api.get(PROTECTED, c.token ? { token: c.token } : {});
        const body = await res.text();
        // The forged-admin-role token has a real sub, so /me resolves the REAL user (subscriber) — still safe.
        if (c.name.startsWith('privilege claim')) {
          expect(res.status(), c.name).toBe(200);
          expect(JSON.parse(body).role, 'forged role claim must not elevate — DB role wins').toBe('subscriber');
        } else {
          expect(res.status(), `${c.name} → expected 401`).toBe(401);
        }
        expect(res.status(), `${c.name} must not 500`).not.toBe(500);
        expect(noStackTrace(body), `${c.name} must not leak a stack trace`).toBe(true);
      }
      // sanity: the real token works
      expect((await api.get(PROTECTED, { token: acct.access })).status()).toBe(200);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('SA-002 a deactivated user\'s valid token can no longer access protected resources @security @api @P1 @auth', async ({ api, config }, info) => {
    meta(info, 'AUTHZ-001', ['ADMIN-001']);
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    try {
      expect((await api.get(PROTECTED, { token: acct.access })).status(), 'active → 200').toBe(200);
      deactivateUser(config, u.email);
      const res = await api.get(PROTECTED, { token: acct.access });
      expect([401, 403], 'deactivated → rejected').toContain(res.status());
      expect(res.status()).not.toBe(200);
    } finally {
      deleteUser(config, u.email);
    }
  });
});
