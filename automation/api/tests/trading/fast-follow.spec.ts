/**
 * Fast-follow trading cases that need no broker-behavior injection (pure validation / fanout selection).
 * Manual: trade-001__order-placement.md, copy-001__fanout.md. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { childId, childOrders, auditCount, subscriberPickedAtSet } from '../../../common/tradingSetup.js';

test.describe('Fast-follow (no broker-behavior needed)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-TRADE-001-002 limit BUY option with valid OCC fields is accepted @trading @api @P1 @positive', async ({ api, config }, info) => {
    meta(info, 'TRADE-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await api.post(`/api/trades?broker_account_id=${p.brokerAccountId}`, {
        token: p.traderAccess,
        data: {
          instrument_type: 'option', symbol: 'AAPL', side: 'buy', order_type: 'limit',
          quantity: 1, limit_price: 2.5, option_expiry: '2026-12-18', option_strike: 200, option_right: 'call',
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      const body = await res.json();
      expect(body.instrument_type).toBe('option');
    } finally {
      p.cleanup();
    }
  });

  test('TC-TRADE-001-004 inverted bracket geometry is rejected (422) @trading @api @P1 @boundary', async ({ api, config }, info) => {
    meta(info, 'TRADE-001');
    const p = await provisionFanout(api, config, []);
    try {
      // buy bracket requires sl < entry < tp; invert it → 422
      const res = await api.post(`/api/trades?broker_account_id=${p.brokerAccountId}`, {
        token: p.traderAccess,
        data: {
          instrument_type: 'stock', symbol: 'AAPL', side: 'buy', order_type: 'limit', quantity: 5,
          limit_price: 100, take_profit_price: 90, stop_loss_price: 110,
        },
      });
      expect(res.status()).toBe(422);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-001-004 excluded symbol is not mirrored @trading @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'COPY-001');
    const p = await provisionFanout(api, config, [{ symbol_exclusion: ['MSFT'] }]);
    try {
      const sub = p.subs[0]!;
      const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('MSFT', 5));
      const parent = (await res.json()).id as string;
      await expect.poll(() => auditCount(config, 'copy.skipped_excluded_symbol'), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      expect(childId(config, parent, sub.user_id), 'excluded symbol → no mirror').toBe('');
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-001-009 fanout stamps performance timestamps on the mirror @trading @api @P2 @observability', async ({ api, config }, info) => {
    meta(info, 'COPY-001');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const parent = (await res.json()).id as string;
      await expect.poll(() => childOrders(config, parent).length, { timeout: 20000 }).toBe(1);
      const cid = childId(config, parent, sub.user_id);
      expect(subscriberPickedAtSet(config, cid), 'mirror carries subscriber_picked_at').toBe(true);
    } finally {
      p.cleanup();
    }
  });
});
