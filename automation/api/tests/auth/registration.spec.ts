/**
 * AUTH-001 — Register. Manual cases: manual/test-cases/auth/auth-001__register.md
 * Titles carry the permanent TC ID (no AUTO-* ids). Each user has a unique X-Forwarded-For so the
 * per-IP register throttle does not bleed across tests.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';

test.describe('AUTH-001 Register', () => {
  test('TC-AUTH-001-001 valid subscriber registration @auth @api @P1', async ({ api }, info) => {
    meta(info, 'AUTH-001');
    const u = makeUser('subscriber');
    const res = await auth.register(api, u);
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.role).toBe('subscriber');
    expect(body.email).toBe(u.email.toLowerCase());
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('password_hash');
  });

  test('TC-AUTH-001-002 valid trader registration with business_name @auth @api @P1', async ({ api }, info) => {
    meta(info, 'AUTH-001');
    const u = makeUser('trader');
    const res = await auth.register(api, u);
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.role).toBe('trader');
    expect(body.business_name).toBe(u.business_name);
  });

  test('TC-AUTH-001-003 duplicate email returns 409 and creates no second row @auth @api @P1 @negative', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-001');
    const u = makeUser('subscriber');
    expect((await auth.register(api, u)).status()).toBe(201);
    const dup = await auth.register(api, u);
    expect(dup.status()).toBe(409);
    expect((await dup.json()).detail).toBe('email_taken');
  });

  test('TC-AUTH-001-004 trader without business_name is rejected 422 @auth @api @P1 @negative', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-001');
    const u = makeUser('trader');
    delete u.business_name;
    expect((await auth.register(api, u)).status()).toBe(422);
  });

  test('TC-AUTH-001-005 self-registration as admin is blocked 422 @auth @api @P1 @security', async ({ api }, info) => {
    meta(info, 'AUTH-001', ['AUTHZ-001']);
    const u = makeUser('subscriber');
    const res = await auth.registerRaw(
      api,
      { email: u.email, password: u.password, role: 'admin', display_name: u.display_name },
      u.clientIp,
    );
    expect(res.status()).toBe(422);
  });

  test('TC-AUTH-001-006 password policy boundaries @auth @api @P1 @boundary', async ({ api }, info) => {
    meta(info, 'AUTH-001');
    // 1) 7 chars -> 422 (below min 8)
    expect((await auth.register(api, makeUser('subscriber', { password: 'Ab1!xyz' }))).status()).toBe(422);
    // 2) 8 chars, 3+ classes -> 201 (lower boundary accepted)
    expect((await auth.register(api, makeUser('subscriber', { password: 'Ab1!xyza' }))).status()).toBe(201);
    // 3) 8 chars all-lowercase (1 class) -> 422 (complexity)
    expect((await auth.register(api, makeUser('subscriber', { password: 'abcdefgh' }))).status()).toBe(422);
  });

  test('TC-AUTH-001-007 email normalized to lowercase @auth @api @P2 @data-integrity', async ({ api }, info) => {
    meta(info, 'AUTH-001', ['AUTH-002']);
    const u = makeUser('subscriber');
    const mixed = u.email.toUpperCase();
    const res = await auth.registerRaw(
      api,
      { email: `  ${mixed}  `, password: u.password, role: 'subscriber', display_name: u.display_name },
      u.clientIp,
    );
    expect(res.status()).toBe(201);
    // login with the normalized (lowercase, trimmed) form works
    expect((await auth.login(api, u.email.toLowerCase(), u.password, u.clientIp)).status()).toBe(200);
  });
});
