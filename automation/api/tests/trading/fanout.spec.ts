/**
 * COPY-001 — Fanout mirroring: one mirror per active subscriber, quantity scaling, copy-disabled and
 * no-broker skips. Manual: manual/test-cases/copy-engine/copy-001__fanout.md
 * LOCAL-ONLY. Fanout is a background task, so child orders are polled (no fixed sleeps).
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { childOrders } from '../../../common/tradingSetup.js';

const SYMBOL = 'MSFT';
const notDead = (s: string) => !['rejected', 'canceled', 'expired'].includes(s);

async function placeAndGetId(api: Parameters<typeof trades.placeOrder>[0], token: string, acct: string, qty: number) {
  const res = await trades.placeOrder(api, token, acct, marketOrder(SYMBOL, qty));
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id as string;
}

test.describe('COPY-001 Fanout', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Fanout/DB assertions require the local stack.');

  test('TC-COPY-001-001 one mirror order per active subscriber @trading @api @P0 @integration', async ({ api, config }, info) => {
    meta(info, 'COPY-001', ['TRADE-001']);
    const p = await provisionFanout(api, config, [{ multiplier: 1 }, { multiplier: 1 }]);
    try {
      const orderId = await placeAndGetId(api, p.traderAccess, p.brokerAccountId, 5);
      await expect.poll(() => childOrders(config, orderId).length, { timeout: 20000 }).toBe(2);
      const kids = childOrders(config, orderId);
      const owners = new Set(kids.map((k) => k.userId));
      expect(owners.size, 'exactly two DISTINCT subscribers — no duplicate mirror').toBe(2);
      for (const s of p.subs) expect(owners.has(s.user_id)).toBe(true);
      for (const k of kids) expect(notDead(k.status), `mirror status ${k.status}`).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-001-002 quantity scaling by multiplier @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'COPY-001');
    const p = await provisionFanout(api, config, [{ multiplier: 3 }]);
    try {
      const orderId = await placeAndGetId(api, p.traderAccess, p.brokerAccountId, 10);
      await expect.poll(() => childOrders(config, orderId).length, { timeout: 20000 }).toBe(1);
      const kid = childOrders(config, orderId)[0]!;
      expect(kid.userId).toBe(p.subs[0]!.user_id);
      expect(Number(kid.quantity), 'trader 10 × multiplier 3 = 30').toBe(30);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-001-003 copy-disabled subscriber gets no mirror @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'COPY-001');
    // A copies, B disabled — A's mirror proves fanout ran; B's absence proves the copy_enabled filter.
    const p = await provisionFanout(api, config, [{ copy_enabled: true }, { copy_enabled: false }]);
    try {
      const a = p.subs[0]!;
      const b = p.subs[1]!;
      const orderId = await placeAndGetId(api, p.traderAccess, p.brokerAccountId, 5);
      await expect.poll(() => childOrders(config, orderId).length, { timeout: 20000 }).toBe(1);
      const kids = childOrders(config, orderId);
      expect(kids[0]!.userId).toBe(a.user_id);
      expect(kids.some((k) => k.userId === b.user_id), 'disabled subscriber must have no mirror').toBe(false);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-001-005 subscriber with no connected broker is skipped cleanly @trading @api @P1 @recovery', async ({ api, config }, info) => {
    meta(info, 'COPY-001');
    // A has a broker, B has none — fanout must still complete for A and not crash on B.
    const p = await provisionFanout(api, config, [{ broker: true }, { broker: false }]);
    try {
      const a = p.subs[0]!;
      const b = p.subs[1]!;
      expect(b.account_id).toBeNull();
      const orderId = await placeAndGetId(api, p.traderAccess, p.brokerAccountId, 5);
      await expect.poll(() => childOrders(config, orderId).length, { timeout: 20000 }).toBe(1);
      const kids = childOrders(config, orderId);
      expect(kids[0]!.userId).toBe(a.user_id);
      expect(kids.some((k) => k.userId === b.user_id)).toBe(false);
    } finally {
      p.cleanup();
    }
  });
});
