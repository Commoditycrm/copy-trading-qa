/**
 * TC-COPY-001-006 — multi-subscriber failure isolation: one subscriber's failure must not abort fanout
 * for the others. A succeeds, B rejects, C hits a transient error (→ retry_pending). Per-subscriber
 * scenarios come from the mock broker (keyed by each sub's broker account).
 * Manual: copy-001__fanout.md. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { childForUser, auditCount } from '../../../common/tradingSetup.js';

const SYM = 'AAPL';
const status = (cfg: any, parent: string, user: string) => childForUser(cfg, parent, user)?.status ?? 'none';

test.describe('Multi-subscriber isolation (mock broker)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-COPY-001-006 one subscriber failure does not abort the others (A ok / B reject / C transient) @trading @api @P0 @recovery', async ({ api, config }, info) => {
    meta(info, 'COPY-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}, {}, { retry_open: '1m' }]);
    try {
      const [a, b, c] = [p.subs[0]!, p.subs[1]!, p.subs[2]!];
      await mb.setSubscriberScenario(a.account_id!, 'success');
      await mb.setSubscriberScenario(b.account_id!, 'reject', { reason: 'asset not tradable' });
      await mb.setSubscriberScenario(c.account_id!, 'transient');

      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYM, 5));
      const parent = (await placed.json()).id as string;

      // each subscriber reaches its own expected state — one failure never aborts the others
      await expect.poll(() => status(config, parent, b.user_id), { timeout: 20000 }).toBe('rejected');
      await expect.poll(() => status(config, parent, c.user_id), { timeout: 20000 }).toBe('retry_pending');
      expect(['submitted', 'accepted', 'filled']).toContain(status(config, parent, a.user_id));

      // owners + statuses are independent rows
      const A = childForUser(config, parent, a.user_id)!;
      const B = childForUser(config, parent, b.user_id)!;
      const C = childForUser(config, parent, c.user_id)!;
      expect(A.reject_reason).toBe('');
      expect(B.reject_reason.length).toBeGreaterThan(0);
      expect(C.hasRetryAt).toBe(true);

      // one broker place per subscriber (3 total) — none skipped by another's failure
      expect(await mb.callCount('place', a.account_id!)).toBe(1);
      expect(await mb.callCount('place', b.account_id!)).toBe(1);
      expect(await mb.callCount('place', c.account_id!)).toBe(1);

      // audits are written independently (C's transient park is audited)
      expect(auditCount(config, 'copy.retry_scheduled')).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });
});
