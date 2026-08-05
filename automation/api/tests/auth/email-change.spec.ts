/**
 * AUTH-005 — Email change & stale verification. Manual: manual/test-cases/auth/auth-005__email-verify-change.md
 * Uses the local email SINK with token-TYPE filtering (verify vs email_change) matched to this user.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { tokenForSubject } from '../../../common/emailSink.js';

const newEmail = () => `qa+new-${Date.now()}-${Math.floor(Math.random() * 1e4)}@qa.kopyya.dev`;

test.describe('AUTH-005 Email change', () => {
  test('TC-AUTH-005-003 successful email change (password + verify) applies only after verify @auth @api @P2 @integration', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-005', ['AUTH-002']);
    const u = makeUser('subscriber');
    const { access, id } = await auth.registerAndLogin(api, u);
    const target = newEmail();
    const ce = await auth.changeEmail(api, access, target, u.password);
    expect(ce.status(), await ce.text()).toBe(200);
    // before verify: old email still logs in, new does not
    expect((await auth.login(api, u.email, u.password, u.clientIp)).status()).toBe(200);
    expect((await auth.login(api, target, u.password, u.clientIp)).status()).toBe(401);
    // confirmation to the NEW address carries an email_change token
    let tok: string | null = null;
    await expect
      .poll(() => (tok = tokenForSubject({ userId: id, type: 'email_change' })), { timeout: 15000 })
      .toBeTruthy();
    expect((await auth.verifyEmailChange(api, tok!)).status()).toBe(200);
    // after verify: new email logs in, old does not
    expect((await auth.login(api, target, u.password, u.clientIp)).status()).toBe(200);
    expect((await auth.login(api, u.email, u.password, u.clientIp)).status()).toBe(401);
  });

  test('TC-AUTH-005-004 change-email wrong password 403; rate-limited (429 + Retry-After) @auth @api @P2 @negative @recovery', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-005');
    const u = makeUser('subscriber');
    const { access } = await auth.registerAndLogin(api, u);
    // wrong password → 403 invalid_password
    const bad = await auth.changeEmail(api, access, newEmail(), u.password + 'x');
    expect(bad.status()).toBe(403);
    expect((await bad.json()).detail).toBe('invalid_password');
    // repeated (correct-password) change requests trip the per-user throttle (5/hr)
    let saw429 = false;
    for (let i = 0; i < 8; i += 1) {
      const r = await auth.changeEmail(api, access, newEmail(), u.password);
      if (r.status() === 429) {
        saw429 = true;
        expect(r.headers()['retry-after']).toBeTruthy();
        break;
      }
    }
    expect(saw429, 'expected a 429 email-change throttle within 8 requests').toBe(true);
  });

  test('TC-AUTH-005-005 verify-email-change to a taken address is rejected (409) @auth @api @P2 @data-integrity', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-005');
    const a = makeUser('subscriber');
    const b = makeUser('subscriber');
    const A = await auth.registerAndLogin(api, a);
    expect((await auth.register(api, b)).status()).toBe(201); // B keeps its email
    const ce = await auth.changeEmail(api, A.access, b.email, a.password);
    // Documented: clash may surface at request (409) or at verify (409). Accept either path.
    if (ce.status() === 409) {
      expect((await ce.json()).detail).toBe('email_taken');
    } else {
      expect(ce.status()).toBe(200);
      let tok: string | null = null;
      await expect
        .poll(() => (tok = tokenForSubject({ userId: A.id, type: 'email_change' })), { timeout: 15000 })
        .toBeTruthy();
      const v = await auth.verifyEmailChange(api, tok!);
      expect(v.status()).toBe(409);
      expect((await v.json()).detail).toBe('email_taken');
    }
    // A's email is unchanged either way
    expect((await auth.login(api, a.email, a.password, a.clientIp)).status()).toBe(200);
  });

  test('TC-AUTH-005-002 stale verification token after the email changes is rejected (400) @auth @api @P2 @negative', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-005');
    const u = makeUser('subscriber');
    const { access, id } = await auth.registerAndLogin(api, u);
    // capture the ORIGINAL verify token (eml = original email)
    let vTok: string | null = null;
    await expect.poll(() => (vTok = tokenForSubject({ userId: id, type: 'verify' })), { timeout: 15000 }).toBeTruthy();
    // change the email to a new address and apply it
    const target = newEmail();
    expect((await auth.changeEmail(api, access, target, u.password)).status()).toBe(200);
    let ecTok: string | null = null;
    await expect
      .poll(() => (ecTok = tokenForSubject({ userId: id, type: 'email_change' })), { timeout: 15000 })
      .toBeTruthy();
    expect((await auth.verifyEmailChange(api, ecTok!)).status()).toBe(200);
    // the OLD verify token (eml=original) is now stale → 400
    const res = await auth.verifyEmail(api, vTok!);
    expect(res.status()).toBe(400);
  });
});
