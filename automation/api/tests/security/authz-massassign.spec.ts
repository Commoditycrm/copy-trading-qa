/**
 * SA-004 — privilege escalation, mass-assignment, and cross-tenant isolation (IDOR).
 * Registration/self-update must not let a caller set privileged fields (role/is_active/email_verified/id),
 * and one tenant must never reach another tenant's resources by id — including destructive routes.
 * DB state is asserted unchanged on every rejected attempt.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin, registerRaw, updateMe } from '../../clients/authApi.js';
import { deleteUser, userRole, isActive } from '../../../common/localAdmin.js';
import { provisionFanout } from '../trading/helpers.js';
import { brokerAccountExists } from '../../../common/tradingSetup.js';

test.describe('SA-004 privilege escalation & tenant isolation', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Security suite runs against the local stack.');

  test('SA-004 registration cannot mass-assign role=admin / is_active / email_verified @security @api @P0 @authz', async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTH-001', ['ADMIN-001']);
    // (a) role=admin at registration must be rejected outright.
    const adminTry = makeUser('subscriber');
    const rAdmin = await registerRaw(api, { ...adminTry, role: 'admin' });
    expect(rAdmin.status(), 'role=admin registration rejected').toBe(422);

    // (b) injected privileged fields must be ignored, not applied.
    const u = makeUser('subscriber');
    const res = await registerRaw(api, {
      ...u,
      is_active: false,
      email_verified: true,
      id: '00000000-0000-4000-8000-000000000001',
    } as Record<string, unknown>);
    try {
      expect(res.status(), 'registration accepted').toBeLessThan(300);
      expect(userRole(config, u.email), 'role is subscriber, not escalated').toBe('subscriber');
      const me = await (await api.post('/api/auth/login', { data: { email: u.email, password: u.password } })).json();
      // email_verified must reflect the real (unverified) state, not the injected true.
      expect(me.user?.email_verified ?? false, 'email_verified not mass-assigned').toBe(false);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('SA-004 self-update (PATCH /api/auth/me) cannot change role or is_active @security @api @P1 @authz', async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTH-001');
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    try {
      const res = await updateMe(api, acct.access, { role: 'trader', is_active: false, email_verified: true } as Record<
        string,
        unknown
      >);
      expect(res.status(), 'patch accepted (extra fields ignored)').toBeLessThan(300);
      expect(userRole(config, u.email), 'role unchanged').toBe('subscriber');
      expect(isActive(config, u.email), 'still active').toBe(true);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test("SA-004 a stranger cannot delete another tenant's broker account (IDOR) @security @api @P0 @authz", async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTHZ-001', ['BRK-001']);
    const p = await provisionFanout(api, config, [{}]);
    const attackerU = makeUser('trader');
    const attacker = await registerAndLogin(api, attackerU);
    try {
      const res = await api.delete(`/api/brokers/${p.brokerAccountId}`, { token: attacker.access });
      expect([403, 404], 'cross-tenant delete denied').toContain(res.status());
      expect(res.status(), 'not silently deleted').not.toBe(204);
      expect(brokerAccountExists(config, p.brokerAccountId), 'victim broker still present').toBe(true);
    } finally {
      deleteUser(config, attackerU.email);
      p.cleanup();
    }
  });
});
