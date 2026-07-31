/**
 * AUTH-002 — Login. Manual cases: manual/test-cases/auth/auth-002__login.md
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { deactivateUser, deleteUser } from '../../../common/localAdmin.js';

test.describe('AUTH-002 Login', () => {
  test('TC-AUTH-002-001 valid login returns a token pair @auth @api @P1', async ({ api }, info) => {
    meta(info, 'AUTH-002');
    const u = makeUser('subscriber');
    expect((await auth.register(api, u)).status()).toBe(201);
    const res = await auth.login(api, u.email, u.password, u.clientIp);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
  });

  test('TC-AUTH-002-002 wrong password returns 401 invalid_credentials @auth @api @P1 @negative', async ({ api }, info) => {
    meta(info, 'AUTH-002');
    const u = makeUser('subscriber');
    expect((await auth.register(api, u)).status()).toBe(201);
    const res = await auth.login(api, u.email, u.password + 'x', u.clientIp);
    expect(res.status()).toBe(401);
    expect((await res.json()).detail).toBe('invalid_credentials');
  });

  test('TC-AUTH-002-004 repeated failures trip the per-email lockout (429) @auth @api @P1 @recovery', async ({ api }, info) => {
    meta(info, 'AUTH-002');
    const u = makeUser('subscriber');
    expect((await auth.register(api, u)).status()).toBe(201);
    let sawLock = false;
    for (let i = 0; i < 10; i += 1) {
      const r = await auth.login(api, u.email, 'wrong-password', u.clientIp);
      if (r.status() === 429) {
        sawLock = true;
        expect(r.headers()['retry-after']).toBeTruthy();
        break;
      }
    }
    expect(sawLock, 'expected a 429 lockout within 10 failed attempts (Redis limiter must be up)').toBe(true);
  });

  test('TC-AUTH-002-005 unverified email can still log in (soft verification) @auth @api @P2 @data-integrity', async ({ api }, info) => {
    meta(info, 'AUTH-002', ['AUTH-005']);
    const u = makeUser('subscriber');
    expect((await auth.register(api, u)).status()).toBe(201); // unverified
    const res = await auth.login(api, u.email, u.password, u.clientIp);
    expect(res.status()).toBe(200);
  });

  test('TC-AUTH-002-003 inactive user cannot log in (403 user_inactive) @auth @api @P1 @permission', async ({ api, config }, info) => {
    meta(info, 'AUTH-002', ['ADMIN-001']);
    const u = makeUser('subscriber');
    expect((await auth.register(api, u)).status()).toBe(201);
    // deactivate ONLY this namespaced test user via the local-only admin helper
    deactivateUser(config, u.email);
    try {
      const res = await auth.login(api, u.email, u.password, u.clientIp);
      expect(res.status()).toBe(403);
      expect((await res.json()).detail).toBe('user_inactive');
    } finally {
      deleteUser(config, u.email); // cleanup the namespaced test user (restore/remove)
    }
  });
});
