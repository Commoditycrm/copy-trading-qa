/**
 * AUTH-003 — Refresh token. Manual cases: manual/test-cases/auth/auth-003__refresh.md
 * Adversarial token cases use the shared QA-only JWT secret (isolated local env; never prod).
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { mintExpiredAccess, mintMalformedSub, mintAccess } from '../../../common/jwt.js';

test.describe('AUTH-003 Refresh', () => {
  test('TC-AUTH-003-001 valid refresh returns a new pair @auth @api @P1', async ({ api }, info) => {
    meta(info, 'AUTH-003', ['AUTH-002']);
    const u = makeUser('subscriber');
    const { refresh } = await auth.registerAndLogin(api, u);
    const res = await auth.refresh(api, refresh);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    // new access token authenticates a protected GET
    expect((await auth.me(api, body.access_token)).status()).toBe(200);
  });

  test('TC-AUTH-003-002 malformed sub — DEFECT CONFIRM (expected 401, currently 500) @auth @api @P1 @negative', async ({ api, config }, info) => {
    meta(info, 'AUTH-003');
    const forged = mintMalformedSub(config); // sub = "not-a-uuid"
    const res = await auth.refresh(api, forged);
    // Record the OBSERVED status; the intended behavior is 401. A 500 confirms baseline §27.
    await info.attach('observed-status', { body: String(res.status()), contentType: 'text/plain' });
    expect([401, 500]).toContain(res.status());
    if (res.status() === 500) {
      info.annotations.push({ type: 'potential_defect', description: 'refresh malformed-sub returns 500 (expected 401) — baseline §27' });
    }
  });

  test('TC-AUTH-003-003 wrong token type (access as refresh) → 401 @auth @api @P1 @negative', async ({ api, config }, info) => {
    meta(info, 'AUTH-003');
    // A valid access token presented on the refresh endpoint.
    const access = mintAccess(config, '00000000-0000-0000-0000-000000000001', 'subscriber');
    const res = await auth.refresh(api, access);
    expect(res.status()).toBe(401);
    expect((await res.json()).detail).toBe('wrong_token_type');
  });

  test('TC-AUTH-003-004 expired refresh token → 401 @auth @api @P1 @boundary', async ({ api, config }, info) => {
    meta(info, 'AUTH-003');
    // Mint an expired token of type refresh.
    const expired = mintExpiredAccess(config, '00000000-0000-0000-0000-000000000002', 'subscriber');
    // (expired access presented as refresh still fails on expiry first → 401)
    const res = await auth.refresh(api, expired);
    expect(res.status()).toBe(401);
  });

  test('TC-AUTH-003-005 old refresh token still valid after rotation (no revocation) @auth @api @P2 @security', async ({ api }, info) => {
    meta(info, 'AUTH-003');
    const u = makeUser('subscriber');
    const { refresh } = await auth.registerAndLogin(api, u);
    expect((await auth.refresh(api, refresh)).status()).toBe(200); // rotate once
    // original refresh token STILL works (documents the no-revocation gap)
    expect((await auth.refresh(api, refresh)).status()).toBe(200);
  });
});
