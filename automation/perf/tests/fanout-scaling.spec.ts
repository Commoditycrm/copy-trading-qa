/**
 * PERF fanout scaling — TC-PERF-001-006. Measures copy-engine fanout for 10/25/50/75/100/200 subscribers.
 * Subscribers are bulk-seeded via the admin load-test endpoint; a trader order is fanned out via the
 * grey-box copy engine; latency is read from the app's OWN instrumented metrics (`/api/performance/fanouts`:
 * avg_fanout_ms / max_fanout_ms / pct_within_1s) plus wall-clock. SLO reference: pct_within_1s (app signal).
 * SAFETY: fake broker, synthetic @qa.kopyya.dev, local-qa only; load-test data cleaned in finally.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, meta } from '../../common/fixtures.js';
import { provisionFanout } from '../../api/tests/trading/helpers.js';
import { MockBroker } from '../../common/mockBrokerClient.js';
import * as trades from '../../api/clients/tradesApi.js';
import { marketOrder } from '../../api/clients/tradesApi.js';
import * as a from '../../api/clients/adminApi.js';
import { childOrders } from '../../common/tradingSetup.js';
import { makeUser } from '../../common/factory.js';
import { registerAndLogin } from '../../api/clients/authApi.js';
import { promoteToAdmin, deleteUser } from '../../common/localAdmin.js';
import { mintAccess } from '../../common/jwt.js';

const LEVELS = (process.env.PERF_LEVELS || '10,25,50,75,100,200').split(',').map(Number);
const compose = resolve(dirname(fileURLToPath(import.meta.url)), '../../local-stack/docker-compose.qa.yml');

/** Invalidate the per-trader subscriber cache so the next fanout reads all N freshly-seeded subs from DB. */
function clearSubsCache(traderId: string): void {
  try {
    execSync(`docker compose -f "${compose}" exec -T redis redis-cli -a qaredispass DEL "cache:subs:${traderId}"`, { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    /* best effort */
  }
}

test.describe('PERF fanout scaling', () => {
  test.skip(({ config }) => config.envName !== 'local', 'perf runs against the local full stack.');

  test('TC-PERF-001-006 fanout latency by subscriber count @perf @P1', async ({ api, config }, info) => {
    meta(info, 'PERF-001', ['COPY-001']);
    test.setTimeout(600_000);
    const adminU = makeUser('subscriber');
    const adminAcct = await registerAndLogin(api, adminU);
    promoteToAdmin(config, adminU.email);
    const adminToken = mintAccess(config, adminAcct.id, 'admin');
    const p = await provisionFanout(api, config, []);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const rows: Record<string, unknown>[] = [];
    try {
      for (const N of LEVELS) {
        // load-test seed `count` is the TOTAL desired (idempotent) — seed up to N.
        const seedRes = await a.loadTestSeed(api, adminToken, { trader_email: p.traderEmail, count: N });
        expect(seedRes.status(), `seed ${N}`).toBeLessThan(300);
        // Deterministic cache: DEL the stale key, then warm it from DB so the cache holds all N before the
        // order (avoids the prior fanout re-populating a stale count between rapid sequential cycles).
        clearSubsCache(p.traderId);
        mb.warmSubsCache(p.traderId);
        const t0 = Date.now();
        const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
        const body = await res.json();
        const orderId = body.id ?? body.order?.id;
        expect(orderId, 'order placed').toBeTruthy();

        // Natural async fanout (load-test subs are picked up by the app's own worker path). Poll until ALL
        // N mirrors for THIS parent exist (isolated by parent_order_id), then take the wall-clock.
        let complete = true;
        await expect
          .poll(() => childOrders(config, orderId).length, { timeout: 45_000, intervals: [400, 800] })
          .toBeGreaterThanOrEqual(N)
          .catch(() => {
            complete = false;
          });
        const wallMs = Date.now() - t0;
        const kids = childOrders(config, orderId).length;

        const perf = await (await api.get('/api/performance/fanouts', { token: p.traderAccess })).json();
        const m = perf.metrics ?? {};
        const row = {
          subscribers: N,
          complete,
          children: kids,
          wall_ms: wallMs,
          avg_fanout_ms: m.avg_fanout_ms ?? null,
          max_fanout_ms: m.max_fanout_ms ?? null,
          pct_within_1s: m.pct_within_1s ?? null,
        };
        rows.push(row);
        // eslint-disable-next-line no-console
        console.log('PERF_FANOUT|' + JSON.stringify(row));
      }
    } finally {
      await a.loadTestCleanup(api, adminToken, { trader_email: p.traderEmail }).catch(() => {});
      deleteUser(config, adminU.email);
      p.cleanup();
    }
    await info.attach('fanout-scaling.json', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
    expect(rows.length, 'all levels measured').toBe(LEVELS.length);
  });
});
