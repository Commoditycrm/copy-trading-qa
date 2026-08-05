/**
 * AUTH-004 — Password reset. Manual: manual/test-cases/auth/auth-004__password-reset.md
 * Uses the local email SINK (backend logs the reset link when SendGrid is blank), matching the token to
 * THIS user by decoded claim. Includes two Known/Potential defect confirmations.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { tokenForSubject } from '../../../common/emailSink.js';

async function registerId(api: Parameters<typeof auth.register>[0], u: ReturnType<typeof makeUser>): Promise<string> {
  const r = await auth.register(api, u);
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).id as string;
}

test.describe('AUTH-004 Password reset', () => {
  test('TC-AUTH-004-001 forgot-password returns a generic message @auth @api @P1', async ({ api }, info) => {
    meta(info, 'AUTH-004');
    const u = makeUser('subscriber');
    await registerId(api, u);
    expect((await auth.forgotPassword(api, u.email, u.clientIp)).status()).toBe(200);
  });

  test('TC-AUTH-004-002 reset with a valid token sets a new password @auth @api @P1 @integration', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-004', ['AUTH-002']);
    const u = makeUser('subscriber');
    const id = await registerId(api, u);
    expect((await auth.forgotPassword(api, u.email, u.clientIp)).status()).toBe(200);
    let token: string | null = null;
    await expect.poll(() => (token = tokenForSubject({ userId: id, type: 'reset' })), { timeout: 15000 }).toBeTruthy();
    const newPw = 'Qa!Reset123';
    expect((await auth.resetPassword(api, token!, newPw)).status()).toBe(200);
    expect((await auth.login(api, u.email, u.password, u.clientIp)).status()).toBe(401); // old fails
    expect((await auth.login(api, u.email, newPw, u.clientIp)).status()).toBe(200); // new works
  });

  test('TC-AUTH-004-003 reset token is single-use @auth @api @P1 @data-integrity', async ({ api }, info) => {
    meta(info, 'AUTH-004');
    const u = makeUser('subscriber');
    const id = await registerId(api, u);
    expect((await auth.forgotPassword(api, u.email, u.clientIp)).status()).toBe(200);
    let token: string | null = null;
    await expect.poll(() => (token = tokenForSubject({ userId: id, type: 'reset' })), { timeout: 15000 }).toBeTruthy();
    expect((await auth.resetPassword(api, token!, 'Qa!Once123')).status()).toBe(200);
    expect((await auth.resetPassword(api, token!, 'Qa!Twice123')).status()).toBe(400); // reuse rejected
  });

  test('TC-AUTH-004-004 reset enforces the registration password policy (weak rejected) @auth @api @P1 @security', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-004', ['AUTH-001']);
    const u = makeUser('subscriber');
    const id = await registerId(api, u);
    expect((await auth.forgotPassword(api, u.email, u.clientIp)).status()).toBe(200);
    let token: string | null = null;
    await expect.poll(() => (token = tokenForSubject({ userId: id, type: 'reset' })), { timeout: 15000 }).toBeTruthy();
    const weak = 'abcdefgh'; // registration REJECTS this (TC-AUTH-001-006 case 3)
    const res = await auth.resetPassword(api, token!, weak);
    await info.attach('reset-weak-status', { body: String(res.status()), contentType: 'text/plain' });
    // DEF-AUTH-002 fixed: reset now applies the same strength policy as registration.
    expect(res.status(), 'weak reset rejected (>=400), matching registration').toBeGreaterThanOrEqual(400);
    expect(res.status(), 'no longer the documented asymmetry').not.toBe(200);
  });

  test('TC-AUTH-004-005 forgot-password for unknown email still 200 (no enumeration) @auth @api @P2 @negative', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-004');
    const res = await auth.forgotPassword(api, `qa+nobody-${Date.now()}@qa.kopyya.dev`);
    expect(res.status()).toBe(200);
  });

  test('TC-AUTH-004-006 mixed-case forgot-password no-match — DEFECT CONFIRM @auth @api @P2 @negative', async ({
    api,
  }, info) => {
    meta(info, 'AUTH-004');
    const u = makeUser('subscriber');
    const id = await registerId(api, u);
    // request with an UPPERCASED email — lookup is case-sensitive vs the stored lowercased row
    const res = await auth.forgotPassword(api, u.email.toUpperCase(), u.clientIp);
    expect(res.status()).toBe(200); // generic message masks the miss
    // confirm NO reset token is produced for this user (the mixed-case lookup missed)
    await new Promise((r) => setTimeout(r, 4000));
    const token = tokenForSubject({ userId: id, type: 'reset' });
    await info.attach('reset-token-for-mixed-case', { body: String(token), contentType: 'text/plain' });
    if (token === null)
      info.annotations.push({
        type: 'potential_defect',
        description: 'mixed-case forgot-password produced NO reset token — baseline §27',
      });
  });
});
