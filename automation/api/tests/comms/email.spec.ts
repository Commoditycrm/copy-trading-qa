/**
 * Email / SendGrid — with SENDGRID_API_KEY blank the app logs the email + link instead of sending
 * (log mode). Asserted via the email log sink; no real email is sent. LOCAL-QA only.
 * Manual: integrations/integ-004__sendgrid-email.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as follow from '../../clients/followApi.js';
import { emailLoggedTo } from '../../../common/emailSink.js';
import { deleteUser } from '../../../common/localAdmin.js';

const FRONTEND = 'http://localhost:3000';

test.describe('Email / SendGrid (log sink)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-INTEG-004-001 registration queues a verification email whose link uses the frontend base URL @comms @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'INTEG-004');
    const u = makeUser('subscriber');
    try {
      expect((await auth.register(api, u)).status()).toBe(201);
      await expect.poll(() => emailLoggedTo(u.email, `${FRONTEND}/verify-email`), { timeout: 15000 }).toBe(true);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-INTEG-004-006 with SendGrid unconfigured the send is logged, not sent (log mode) @comms @api @P1 @observability', async ({ api, config }, info) => {
    meta(info, 'INTEG-004');
    const u = makeUser('subscriber');
    try {
      await auth.register(api, u);
      await expect.poll(() => emailLoggedTo(u.email), { timeout: 15000 }).toBe(true); // "SENDGRID_API_KEY not set; NOT sending. to=..."
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-INTEG-004-003 forgot-password queues a reset email with a bound reset link @comms @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'INTEG-004', ['AUTH-004']);
    const u = makeUser('subscriber');
    try {
      await auth.register(api, u);
      expect((await auth.forgotPassword(api, u.email, u.clientIp)).status()).toBe(200);
      await expect.poll(() => emailLoggedTo(u.email, `${FRONTEND}/reset-password`), { timeout: 15000 }).toBe(true);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-INTEG-004-011 forgot-password is anti-enumeration — unknown email is a generic 200 with no email @comms @api @P1 @security', async ({ api, config }, info) => {
    meta(info, 'INTEG-004', ['AUTH-004']);
    const unknown = `qa+ghost-${Date.now()}@qa.kopyya.dev`;
    const res = await auth.forgotPassword(api, unknown, '10.9.9.9');
    expect(res.status(), 'generic 200 regardless of existence').toBe(200);
    // give any (non-)dispatch a moment, then assert no email was queued for the non-existent address
    await new Promise((r) => setTimeout(r, 2000));
    expect(emailLoggedTo(unknown), 'no email for a non-existent account').toBe(false);
  });

  test('TC-INTEG-004-004 email-change sends a confirmation to the new address and a notice to the old @comms @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'INTEG-004', ['AUTH-005']);
    const u = makeUser('subscriber');
    const newEmail = `qa+chg-${Date.now()}@qa.kopyya.dev`;
    try {
      const { access } = await auth.registerAndLogin(api, u);
      expect((await auth.changeEmail(api, access, newEmail, u.password)).status()).toBe(200);
      await expect.poll(() => emailLoggedTo(newEmail), { timeout: 15000 }).toBe(true); // confirmation → new
      expect(emailLoggedTo(u.email), 'notice → old address').toBe(true);
    } finally {
      deleteUser(config, u.email);
      deleteUser(config, newEmail);
    }
  });

  test('TC-INTEG-004-005 a follow request queues an email to the trader @comms @api @P2 @integration', async ({ api, config }, info) => {
    meta(info, 'INTEG-004', ['FOLLOW-001']);
    const traderU = makeUser('trader');
    const subU = makeUser('subscriber');
    try {
      const trader = await auth.registerAndLogin(api, traderU);
      const sub = await auth.registerAndLogin(api, subU);
      expect((await follow.createRequest(api, sub.access, trader.id)).status()).toBe(201);
      await expect.poll(() => emailLoggedTo(traderU.email), { timeout: 15000 }).toBe(true);
    } finally {
      deleteUser(config, traderU.email);
      deleteUser(config, subU.email);
    }
  });
});
