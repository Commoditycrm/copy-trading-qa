/**
 * AUTH-005 — Email verification. Manual: manual/test-cases/auth/auth-005__email-verify-change.md
 * Uses the local email SINK, matching the verify token to THIS user by decoded claim (eml/sub).
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { tokenForSubject } from '../../../common/emailSink.js';

test.describe('AUTH-005 Email verification', () => {
  test('TC-AUTH-005-001 verify-email marks verified and is idempotent @auth @api @P2', async ({ api }, info) => {
    meta(info, 'AUTH-005');
    const u = makeUser('subscriber');
    const r = await auth.register(api, u);
    expect(r.status(), await r.text()).toBe(201);
    const id = (await r.json()).id as string;
    let token: string | null = null;
    await expect.poll(() => (token = tokenForSubject({ email: u.email, userId: id, type: 'verify' })), { timeout: 15000 }).toBeTruthy();
    expect((await auth.verifyEmail(api, token!)).status()).toBe(200);
    expect((await auth.verifyEmail(api, token!)).status()).toBe(200); // idempotent
    const login = await auth.login(api, u.email, u.password, u.clientIp);
    const access = (await login.json()).access_token;
    const meRes = await auth.me(api, access);
    expect(meRes.status()).toBe(200);
    expect((await meRes.json()).email_verified).toBe(true);
  });
});
