/**
 * TRADE-001 — Trader order entry, dedup/advisory-lock, ownership, kill-switch, app-originated marker.
 * Manual: manual/test-cases/trading/trade-001__order-placement.md
 * LOCAL-ONLY: seeds fake broker accounts + reads orders/markers from the disposable stack.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { parentOrderCount, setTradingEnabled } from '../../../common/tradingSetup.js';

const SYMBOL = 'AAPL';

test.describe('TRADE-001 Order placement', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Fanout/DB assertions require the local stack.');

  test('TC-TRADE-001-001 trader market BUY is accepted and recorded exactly once @trading @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'TRADE-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYMBOL, 5));
      expect(res.status(), await res.text()).toBe(201);
      const body = await res.json();
      expect(body.id).toBeTruthy();
      expect(body.parent_order_id ?? null).toBeNull();
      expect(String(body.broker_order_id)).toMatch(/^(fake|mock)-/); // mock- from the controllable shim
      expect(parentOrderCount(config, p.traderId, SYMBOL)).toBe(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-TRADE-001-003 missing required fields are rejected 422 @trading @api @P1 @negative', async ({ api, config }, info) => {
    meta(info, 'TRADE-001');
    const p = await provisionFanout(api, config, []);
    try {
      // omit `symbol`
      const res = await api.post(`/api/trades?broker_account_id=${p.brokerAccountId}`, {
        token: p.traderAccess,
        data: { instrument_type: 'stock', side: 'buy', order_type: 'market', quantity: 5 },
      });
      expect(res.status()).toBe(422);
      expect(parentOrderCount(config, p.traderId, SYMBOL)).toBe(0);
    } finally {
      p.cleanup();
    }
  });

  test('TC-TRADE-001-005 placing while trading disabled returns 409 (kill-switch) @trading @api @P1 @security', async ({ api, config }, info) => {
    meta(info, 'TRADE-001');
    const p = await provisionFanout(api, config, []);
    try {
      setTradingEnabled(config, p.traderEmail, false);
      const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(SYMBOL, 5));
      expect(res.status()).toBe(409);
      expect(parentOrderCount(config, p.traderId, SYMBOL)).toBe(0);
    } finally {
      p.cleanup();
    }
  });

  test('TC-TRADE-001-006 placing on a broker account not owned by the trader returns 404 @trading @api @P1 @security', async ({ api, config }, info) => {
    meta(info, 'TRADE-001', ['AUTHZ-001']);
    const p = await provisionFanout(api, config, []);
    try {
      const foreignAccount = '00000000-0000-0000-0000-0000000000ff';
      const res = await trades.placeOrder(api, p.traderAccess, foreignAccount, marketOrder(SYMBOL, 5));
      expect(res.status()).toBe(404);
      expect(parentOrderCount(config, p.traderId, SYMBOL)).toBe(0);
    } finally {
      p.cleanup();
    }
  });

  test('TC-TRADE-001-007 identical orders are deduped — one parent row (advisory lock + 3s window) @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'TRADE-001');
    const p = await provisionFanout(api, config, []);
    try {
      const order = marketOrder(SYMBOL, 7);
      const first = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, order);
      const second = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, order);
      expect(first.status()).toBe(201);
      expect(second.status()).toBe(201);
      // dedup returns the SAME order, and only one parent row exists
      expect((await second.json()).id).toBe((await first.json()).id);
      expect(parentOrderCount(config, p.traderId, SYMBOL)).toBe(1);
    } finally {
      p.cleanup();
    }
  });

  // TC-TRADE-001-010 (listener echo → no double-fanout) is now fully automated end-to-end in
  // api/tests/trading/listener-guard.spec.ts using the mock broker's emitBrokerEvent.
});
