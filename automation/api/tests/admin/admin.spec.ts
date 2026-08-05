/**
 * Admin Operations — authz, user management + safety guards, dashboards/health, rejected-order triage +
 * redaction, load-test seed/cleanup, Redis-backed runtime config, test-SMS (log sink), and the orphaned
 * dashboard route. Admin is a DB-promoted synthetic user + a minted admin token. LOCAL-QA only.
 * Manual: admin/admin__operations.md. NOTE: admin mutations write NO audit rows (documented gap, 001-003).
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { mintAccess } from '../../../common/jwt.js';
import * as auth from '../../clients/authApi.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import * as a from '../../clients/adminApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { promoteToAdmin, promoteToBrokenAdmin, deleteUser, isActive, userRole } from '../../../common/localAdmin.js';
import { redisGet, auditByActor, notifCount } from '../../../common/tradingSetup.js';
import { smsAttempted } from '../../../common/smsSink.js';

async function makeAdmin(api: any, config: any): Promise<{ email: string; id: string; token: string }> {
  const u = makeUser('subscriber');
  const acct = await auth.registerAndLogin(api, u);
  promoteToAdmin(config, u.email);
  return { email: u.email, id: acct.id, token: mintAccess(config, acct.id, 'admin') };
}

test.describe('Admin operations', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-ADMIN-001-004 every /api/admin route is admin-only (403 for non-admin, 401 unauth) @admin @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-001');
    const admin = await makeAdmin(api, config);
    const trader = await auth.registerAndLogin(api, makeUser('trader'));
    try {
      expect((await a.stats(api, admin.token)).status()).toBe(200);
      const denied = await a.stats(api, trader.access);
      expect(denied.status()).toBe(403);
      expect((await denied.json()).detail).toBe('admin_only');
      expect((await api.get('/api/admin/stats')).status(), 'unauthenticated').toBe(401);
    } finally {
      deleteUser(config, admin.email);
    }
  });

  test('TC-ADMIN-001-001 user management — list/search, activate/deactivate, role, business-name @admin @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-001');
    const admin = await makeAdmin(api, config);
    const targetU = makeUser('trader');
    const target = await auth.registerAndLogin(api, targetU);
    try {
      const list = await (await a.users(api, admin.token, { search: targetU.email })).json();
      expect(list.items.some((x: any) => x.id === target.id)).toBe(true);
      expect((await a.deactivate(api, admin.token, target.id)).status()).toBe(200);
      expect(isActive(config, targetU.email)).toBe(false);
      expect((await a.activate(api, admin.token, target.id)).status()).toBe(200);
      expect(isActive(config, targetU.email)).toBe(true);
      expect((await a.changeBusinessName(api, admin.token, target.id, 'QA New Biz')).status()).toBe(200);
      expect((await a.changeRole(api, admin.token, target.id, 'subscriber')).status()).toBe(200);
      expect(userRole(config, targetU.email)).toBe('subscriber');
    } finally {
      deleteUser(config, admin.email);
      deleteUser(config, targetU.email);
    }
  });

  test('TC-ADMIN-001-002 admin safety guards — no deactivate-admin, no self-role-change, business-name trader-only @admin @api @P1 @negative', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-001');
    const admin = await makeAdmin(api, config);
    const subU = makeUser('subscriber');
    const sub = await auth.registerAndLogin(api, subU);
    try {
      const deacAdmin = await a.deactivate(api, admin.token, admin.id);
      expect(deacAdmin.status()).toBe(400);
      expect((await deacAdmin.json()).detail).toBe('cannot_deactivate_admin');
      const ownRole = await a.changeRole(api, admin.token, admin.id, 'trader');
      expect(ownRole.status()).toBe(400);
      expect((await ownRole.json()).detail).toBe('cannot_change_own_role');
      expect((await a.changeBusinessName(api, admin.token, sub.id, 'x')).status(), 'business-name trader-only').toBe(
        400,
      );
    } finally {
      deleteUser(config, admin.email);
      deleteUser(config, subU.email);
    }
  });

  test('TC-ADMIN-001-003 admin user mutations are NOT written to the audit log (documented gap) @admin @api @P2 @observability', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-001');
    const admin = await makeAdmin(api, config);
    const targetU = makeUser('trader');
    const target = await auth.registerAndLogin(api, targetU);
    try {
      await a.deactivate(api, admin.token, target.id);
      await a.changeRole(api, admin.token, target.id, 'subscriber');
      // gap: these emit log.info only, no audit_logs row
      expect(auditByActor(config, 'user.deactivated')).toBe(0);
      expect(auditByActor(config, 'user.role_changed')).toBe(0);
    } finally {
      deleteUser(config, admin.email);
      deleteUser(config, targetU.email);
    }
  });

  test('TC-ADMIN-002-002 dashboards + health — stats, user-counts, daily-pnl, broker/listener health @admin @api @P2 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-002');
    const admin = await makeAdmin(api, config);
    try {
      expect((await a.stats(api, admin.token)).status()).toBe(200);
      const counts = await (await a.userCounts(api, admin.token)).json();
      expect(typeof counts.total).toBe('number');
      expect(counts).toHaveProperty('admin');
      expect((await a.dailyPnl(api, admin.token, '2026-08-01', '2026-08-03')).status()).toBe(200);
      const bh = await (await a.brokerHealth(api, admin.token)).json();
      expect(bh).toHaveProperty('summary');
      expect(bh).toHaveProperty('accounts');
      const lh = await (await a.listenerHealth(api, admin.token)).json();
      expect(lh).toHaveProperty('summary');
      expect(lh).toHaveProperty('listeners');
    } finally {
      deleteUser(config, admin.email);
    }
  });

  test('TC-ADMIN-003-001 rejected-order triage lists rejections and never exposes credentials @admin @api @P2 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-003');
    const admin = await makeAdmin(api, config);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      await mb.setPlaceOrderResult(p.subs[0]!.account_id!, 'reject', { reason: 'asset not tradable' });
      await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      await expect
        .poll(() => notifCount(config, p.subs[0]!.user_id, 'copy.rejected'), { timeout: 20000 })
        .toBeGreaterThanOrEqual(1);
      const res = await a.rejectedOrders(api, admin.token, { role: 'subscriber', limit: 50 });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.rejections.length).toBeGreaterThanOrEqual(1);
      const blob = JSON.stringify(body);
      for (const secret of ['encrypted_credentials', 'api_key', 'api_secret', 'signing_key', 'access_token_secret']) {
        expect(blob.includes(secret), `no ${secret} leak`).toBe(false);
      }
    } finally {
      deleteUser(config, admin.email);
      p.cleanup();
    }
  });

  test('TC-ADMIN-004-001 load-test seed/count/cleanup is idempotent with count bounds @admin @api @P2 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-004');
    const admin = await makeAdmin(api, config);
    const traderU = makeUser('trader');
    await auth.registerAndLogin(api, traderU);
    try {
      expect(
        (await a.loadTestSeed(api, admin.token, { trader_email: traderU.email, count: 501 })).status(),
        'count le=500',
      ).toBe(422);
      const seed1 = await (await a.loadTestSeed(api, admin.token, { trader_email: traderU.email, count: 2 })).json();
      expect(seed1.created).toBe(2);
      const seed2 = await (await a.loadTestSeed(api, admin.token, { trader_email: traderU.email, count: 2 })).json();
      expect(seed2.created, 'idempotent — already seeded').toBe(0);
      expect((await (await a.loadTestCount(api, admin.token)).json()).seeded_users).toBeGreaterThanOrEqual(2);
      const clean1 = await (await a.loadTestCleanup(api, admin.token, { trader_email: traderU.email })).json();
      expect(clean1.deleted).toBeGreaterThanOrEqual(2);
      const clean2 = await (await a.loadTestCleanup(api, admin.token, { trader_email: traderU.email })).json();
      expect(clean2.deleted, 'idempotent cleanup').toBe(0);
    } finally {
      deleteUser(config, admin.email);
      deleteUser(config, traderU.email);
    }
  });

  test('TC-ADMIN-005-002 runtime config knobs persist to Redis with bounds + reset @admin @api @P1 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-005');
    const admin = await makeAdmin(api, config);
    try {
      // fanout threshold (1..10000)
      expect((await a.setFanoutThreshold(api, admin.token, 5)).status()).toBe(200);
      expect(redisGet(config, 'config:fanout_batch_threshold')).toBe('5');
      expect((await (await a.getFanoutThreshold(api, admin.token)).json()).override).toBe(5);
      expect((await a.setFanoutThreshold(api, admin.token, 0)).status(), 'ge=1').toBe(422);
      expect((await a.setFanoutThreshold(api, admin.token, 10001)).status(), 'le=10000').toBe(422);
      expect((await a.setFanoutThreshold(api, admin.token, null)).status()).toBe(200); // reset
      expect(redisGet(config, 'config:fanout_batch_threshold'), 'override deleted').toBe('');
      // alpaca poll interval (1..300)
      expect((await a.setAlpacaInterval(api, admin.token, 30)).status()).toBe(200);
      expect(redisGet(config, 'config:alpaca_pnl_poll_interval_s')).toBe('30');
      expect((await a.setAlpacaInterval(api, admin.token, 400)).status(), 'le=300').toBe(422);
      expect((await a.setAlpacaInterval(api, admin.token, null)).status()).toBe(200);
    } finally {
      // best-effort: clear any overrides we set
      await a.setFanoutThreshold(api, admin.token, null).catch(() => {});
      await a.setAlpacaInterval(api, admin.token, null).catch(() => {});
      deleteUser(config, admin.email);
    }
  });

  test('TC-ADMIN-005-001 admin test-SMS logs a send-attempt (log mode) and validates E.164 @admin @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-005', ['SMS-001']);
    const admin = await makeAdmin(api, config);
    try {
      const phone = '+14155550123';
      const res = await a.smsTest(api, admin.token, phone);
      expect(res.status()).toBe(200);
      expect((await res.json()).ok, 'no real Twilio → ok=false').toBe(false);
      await expect.poll(() => smsAttempted(phone), { timeout: 10000 }).toBe(true);
      expect((await a.smsTest(api, admin.token, '12345')).status(), 'invalid E.164').toBe(422);
    } finally {
      deleteUser(config, admin.email);
    }
  });

  test('TC-ADMIN-001-005 DEF-ADMIN-001 — a shipped-label admin (lowercase user_role) 500s every admin route @admin @api @P0 @defect', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-001');
    // As shipped, the add_admin_role migration stores the enum label lowercase 'admin' while the ORM
    // reads UserRole by name ('ADMIN'). Promoting to the shipped label makes the admin's own user row
    // un-deserializable → 500 on any admin endpoint (LookupError: 'admin' not among enum values).
    const u = makeUser('subscriber');
    const acct = await auth.registerAndLogin(api, u);
    promoteToBrokenAdmin(config, u.email);
    try {
      const res = await a.stats(api, mintAccess(config, acct.id, 'admin'));
      expect(res.status(), 'shipped lowercase-admin label breaks the ORM read').toBe(500);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-ADMIN-007-001 the orphaned /admin/dashboard route is not served by the backend (404) @admin @api @P2 @negative', async ({
    api,
  }, info) => {
    meta(info, 'ADMIN-007');
    expect((await api.get('/admin/dashboard')).status()).toBe(404);
  });
});
