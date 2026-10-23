/**
 * Admin Operations — authz, user management + safety guards, dashboards/health, rejected-order triage +
 * redaction, load-test seed/cleanup, Redis-backed runtime config, test-SMS (log sink), and the orphaned
 * dashboard route; Admin → System storage / Clear Logs access and refusals, and the QA paper auto-trading switch. Admin is a DB-promoted synthetic user + a minted admin token. LOCAL-QA only.
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
import { promoteToAdmin, deleteUser, isActive, userRole } from '../../../common/localAdmin.js';
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

  test('TC-ADMIN-001-005 DEF-ADMIN-001 fixed — a promoted admin resolves and reaches admin routes (200) @admin @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-001');
    // DEF-ADMIN-001 fix (migration a3f9d1c7e2b8) restored the user_role 'ADMIN' label, so an admin's own
    // row is ORM-deserializable and admin routes return 200 (was 500 with the lost-migration lowercase 'admin').
    const u = makeUser('subscriber');
    const acct = await auth.registerAndLogin(api, u);
    promoteToAdmin(config, u.email);
    try {
      expect(userRole(config, u.email), 'role persisted').toBe('admin');
      const res = await a.stats(api, mintAccess(config, acct.id, 'admin'));
      expect(res.status(), 'admin row deserializes → 200 (DEF-ADMIN-001 fixed)').toBe(200);
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

  test('TC-ADMIN-008-001 storage, logs, SMS-cost and paper auto-trading routes are admin-only @admin @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-008', ['ADMIN-009', 'ADMIN-010', 'ADMIN-011']);
    const admin = await makeAdmin(api, config);
    const trader = await auth.registerAndLogin(api, makeUser('trader'));
    try {
      const calls = [a.systemStorage, a.systemLogs, a.smsCosts, a.paperAutotrade];
      for (const call of calls) {
        expect((await call(api, admin.token)).status(), 'admin').toBe(200);
        const denied = await call(api, trader.access);
        expect(denied.status(), 'trader').toBe(403);
        expect((await denied.json()).detail).toBe('admin_only');
      }
      expect((await api.get('/api/admin/system/storage')).status(), 'unauthenticated').toBe(401);
      expect(
        (
          await a.requestLogCleanup(api, trader.access, { categories: ['app_logs'], inventory_id: 'x', confirm: true })
        ).status(),
      ).toBe(403);
      expect((await a.paperAutotradeToggle(api, trader.access, true)).status()).toBe(403);
    } finally {
      deleteUser(config, admin.email);
    }
  });

  test('TC-ADMIN-008-002 storage breakdown is measured or says why not — never zeros @admin @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-008');
    const admin = await makeAdmin(api, config);
    try {
      const body = await (await a.systemStorage(api, admin.token)).json();
      if (body.status === 'unavailable') {
        // the local stack has no host collector: an explanation, not empty figures
        expect(body.reason).toBeTruthy();
        expect(body.categories).toBeUndefined();
        return;
      }
      expect(body.status).toBe('ok');
      const keys = body.categories.map((c: { key: string }) => c.key);
      for (const k of ['app_code', 'postgres', 'docker', 'app_logs', 'system_logs', 'os_other'])
        expect(keys).toContain(k);
      const sum = body.categories.reduce((n: number, c: { bytes: number }) => n + c.bytes, 0);
      expect(sum, 'categories add up to the used bytes').toBe(body.filesystem.used);
    } finally {
      deleteUser(config, admin.email);
    }
  });

  test('TC-ADMIN-009-001 Clear Logs refuses anything unconfirmed, ineligible or not reviewed — nothing is queued @admin @api @P0 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-009');
    const admin = await makeAdmin(api, config);
    try {
      const st = await (await a.systemLogs(api, admin.token)).json();
      expect(['ok', 'unavailable']).toContain(st.status);
      if (st.status === 'ok') {
        expect(st.never_cleared.join(' ')).toMatch(/auth\/security logs/);
        expect(st.never_cleared.join(' ')).toMatch(/orders, fills and audit records/);
        for (const i of st.items) expect(['app_logs', 'docker_logs', 'rotated_system_logs']).toContain(i.category);
      }
      const inv = st.inventory_id ?? 'none';
      const refused = async (body: Record<string, unknown>, why: RegExp): Promise<void> => {
        const res = await a.requestLogCleanup(api, admin.token, body);
        expect(res.status(), JSON.stringify(body)).toBe(409);
        expect((await res.json()).detail).toMatch(why);
      };
      await refused({ categories: ['app_logs'], inventory_id: inv, confirm: false }, /confirm/i);
      await refused({ categories: ['postgres'], inventory_id: inv, confirm: true }, /only these can be cleared/i);
      await refused(
        { categories: ['app_logs'], inventory_id: 'not-the-list-shown', confirm: true },
        st.status === 'ok' ? /changed since you reviewed/i : /isn't installed/i,
      );
      expect(auditByActor(config, 'system.logs_cleanup_requested', admin.id), 'no request was queued').toBe(0);
    } finally {
      deleteUser(config, admin.email);
    }
  });

  test('TC-ADMIN-011-001 paper auto-trading is off and the admin toggle cannot turn it on without the server switch @admin @api @P0 @safety', async ({
    api,
    config,
  }, info) => {
    meta(info, 'ADMIN-011');
    const admin = await makeAdmin(api, config);
    try {
      const st = await (await a.paperAutotrade(api, admin.token)).json();
      expect(st.env_enabled, 'local stack never sets QA_PAPER_AUTOTRADE_ENABLED').toBe(false);
      expect(st.effective).toBe(false);
      const res = await a.paperAutotradeToggle(api, admin.token, true);
      expect(res.status()).toBe(403);
      expect((await (await a.paperAutotrade(api, admin.token)).json()).toggle_on, 'unchanged').toBe(false);
    } finally {
      deleteUser(config, admin.email);
    }
  });
});
