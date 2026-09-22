/**
 * Realized P&L — option 100x contract multiplier (the core of the OCC-retag fix, app 2f9fc46 / PR #297).
 * A short-ticker option that fills via Alpaca's activity feed was mis-tagged STOCK and lost the 100x
 * multiplier, so realized P&L showed 100x too small (0.32 instead of 32.0). pnl.py keys the multiplier
 * off Order.instrument_type, so we seed matched BUY→SELL option legs (mb.seedPnl instrument_type:'option')
 * and assert today's realized reflects (sell-buy)*qty*100. Manual: pnl/pnl-006__occ-short-ticker-classification.md.
 * LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { calendarPnl } from '../../clients/positionsApi.js';

test.describe('Realized P&L — option 100x multiplier', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + fake broker.');

  async function realizedToday(api: import('../../../common/api.js').SafeApi, token: string): Promise<number> {
    const r = await api.get('/api/positions/today-realized', { token });
    expect(r.status(), await r.text()).toBe(200);
    return Number((await r.json()).realized_pnl);
  }

  // (id, label, symbol, qty, buy, sell, right, expected realized) — from PDF section A + B1.
  const CASES: Array<[string, string, string, number, number, number, 'call' | 'put', number]> = [
    ['A1', '1-letter ticker T call → +$32.00', 'T', 1, 0.02, 0.34, 'call', 32.0],
    ['A2', '2-letter ticker VG call → +$50.00', 'VG', 1, 1.0, 1.5, 'call', 50.0],
    ['A3', 'multi-contract MU x3 → +$30.00', 'MU', 3, 2.0, 2.1, 'call', 30.0],
    ['A4', 'loss NG x2 → -$20.00', 'NG', 2, 0.5, 0.4, 'call', -20.0],
    ['A5', 'put AG → -$30.00', 'AG', 1, 1.2, 0.9, 'put', -30.0],
    ['B1', 'long-ticker AAPL option → +$40.00', 'AAPL', 1, 1.0, 1.4, 'call', 40.0],
  ];

  for (const [id, label, symbol, qty, buy, sell, right, expected] of CASES) {
    test(`TC-PNL-006-1${id} ${label} @pnl @api @P1 @integration`, async ({ api, config }, info) => {
      meta(info, 'PNL-006', ['PNL-001']);
      const p = await provisionFanout(api, config, []);
      const mb = new MockBroker(config);
      try {
        mb.seedPnl(p.traderId, p.brokerAccountId, {
          symbol,
          quantity: qty,
          buy_price: buy,
          sell_price: sell,
          instrument_type: 'option',
          option_expiry: '2026-12-18',
          option_strike: 10,
          option_right: right,
        });
        expect(await realizedToday(api, p.traderAccess)).toBeCloseTo(expected, 2);
      } finally {
        p.cleanup();
      }
    });
  }

  test('TC-PNL-006-1B3 plain stock realized has NO 100x multiplier @pnl @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'PNL-006', ['PNL-001']);
    const p = await provisionFanout(api, config, []);
    const mb = new MockBroker(config);
    try {
      // 10 F shares 12.00 → 12.50 = +$5.00 (stock: no x100).
      mb.seedPnl(p.traderId, p.brokerAccountId, { symbol: 'F', quantity: 10, buy_price: 12.0, sell_price: 12.5 });
      expect(await realizedToday(api, p.traderAccess)).toBeCloseTo(5.0, 2);
    } finally {
      p.cleanup();
    }
  });

  test('TC-PNL-006-1D2 a still-open option shows no realized P&L @pnl @api @P2 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'PNL-006');
    const p = await provisionFanout(api, config, []);
    const mb = new MockBroker(config);
    try {
      // buy only, no sell → nothing closed → no realized.
      mb.seedPnl(p.traderId, p.brokerAccountId, {
        symbol: 'VG',
        quantity: 1,
        buy_price: 1.0,
        instrument_type: 'option',
        option_expiry: '2026-12-18',
        option_strike: 10,
        option_right: 'call',
      });
      expect(await realizedToday(api, p.traderAccess)).toBeCloseTo(0, 2);
    } finally {
      p.cleanup();
    }
  });

  test('TC-PNL-006-1F2 the calendar day total reflects the option 100x value @pnl @api @P2 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'PNL-006', ['PNL-001']);
    const p = await provisionFanout(api, config, []);
    const mb = new MockBroker(config);
    try {
      mb.seedPnl(p.traderId, p.brokerAccountId, {
        symbol: 'T',
        quantity: 1,
        buy_price: 0.02,
        sell_price: 0.34,
        instrument_type: 'option',
        option_expiry: '2026-12-18',
        option_strike: 10,
        option_right: 'call',
      });
      const today = new Date().toISOString().slice(0, 10);
      const res = await calendarPnl(api, p.traderAccess, today, today);
      expect(res.status(), await res.text()).toBe(200);
      const body = await res.json();
      const days: Array<Record<string, unknown>> = body.days ?? body.series ?? body;
      const total = (Array.isArray(days) ? days : []).reduce(
        (s, d) => s + Number(d.realized_pnl ?? d.realized ?? 0),
        0,
      );
      // +$32.00 (the x100 value), not +$0.32.
      expect(total).toBeCloseTo(32.0, 2);
    } finally {
      p.cleanup();
    }
  });
});
