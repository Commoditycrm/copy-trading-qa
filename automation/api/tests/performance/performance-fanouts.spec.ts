/**
 * Performance fanouts — the trader Performance feed (GET /api/performance/fanouts, _serialize_fanout)
 * must expose the option contract parts (instrument_type + option_expiry/strike/right) that the admin
 * Performance table renders as the full descriptor via contractLabel() — e.g. "VG C $14 18 Sep 26"
 * (frontend/components/performance/PerformanceView.tsx, app 4535f4f). If the endpoint stops returning
 * these, the label silently falls back to the bare root ("VG"), so this guards that data contract.
 * Uses a SHORT ticker (VG) on purpose — the class the OCC-retag fix (2f9fc46) protects. LOCAL-QA only.
 * Manual: performance/perf-004__option-contract-descriptor.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { provisionFanout } from '../trading/helpers.js';

test.describe('Performance fanouts — option contract descriptor', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + fake broker.');

  test('TC-PERF-004-001 a short-ticker option fanout exposes root/right/strike/expiry @performance @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'PERF-004', ['ADMIN-002', 'COPY-001']);
    // one following subscriber so the parent actually fans out and surfaces in /performance/fanouts.
    const p = await provisionFanout(api, config, [{}]);
    try {
      const place = await api.post(`/api/trades?broker_account_id=${p.brokerAccountId}`, {
        token: p.traderAccess,
        data: {
          instrument_type: 'option',
          symbol: 'VG', // short ticker — old len>=18 gate would have mis-tagged this STOCK
          side: 'buy',
          order_type: 'market',
          quantity: 1,
          option_expiry: '2026-09-18',
          option_strike: 14,
          option_right: 'call',
        },
      });
      expect(place.status(), await place.text()).toBe(201);

      const res = await api.get('/api/performance/fanouts', { token: p.traderAccess });
      expect(res.status()).toBe(200);
      const body = await res.json();
      const row = (body.fanouts as Array<Record<string, unknown>>).find(
        (f) => String(f.symbol).toUpperCase() === 'VG',
      );
      expect(row, 'the VG option fanout is listed').toBeTruthy();
      // exactly the fields contractLabel() joins into "VG C $14 18 Sep 26".
      expect(row!.instrument_type).toBe('option');
      expect(row!.option_right).toBe('call');
      expect(Number(row!.option_strike)).toBe(14);
      expect(row!.option_expiry).toBe('2026-09-18');
    } finally {
      p.cleanup();
    }
  });

  test('TC-PERF-004-002 a stock fanout leaves the option contract parts null @performance @api @P2 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'PERF-004', ['ADMIN-002']);
    const p = await provisionFanout(api, config, [{}]);
    try {
      const place = await api.post(`/api/trades?broker_account_id=${p.brokerAccountId}`, {
        token: p.traderAccess,
        data: { instrument_type: 'stock', symbol: 'MSFT', side: 'buy', order_type: 'market', quantity: 1 },
      });
      expect(place.status(), await place.text()).toBe(201);

      const body = await (await api.get('/api/performance/fanouts', { token: p.traderAccess })).json();
      const row = (body.fanouts as Array<Record<string, unknown>>).find(
        (f) => String(f.symbol).toUpperCase() === 'MSFT',
      );
      expect(row, 'the MSFT stock fanout is listed').toBeTruthy();
      // contractLabel() renders a stock as the bare root — the option parts must be absent/null.
      expect(row!.instrument_type).toBe('stock');
      expect(row!.option_right ?? null).toBeNull();
      expect(row!.option_strike ?? null).toBeNull();
      expect(row!.option_expiry ?? null).toBeNull();
    } finally {
      p.cleanup();
    }
  });

  test('TC-PERF-004-004 a put option fanout exposes option_right=put (renders "P") @performance @api @P2 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'PERF-004', ['ADMIN-002']);
    const p = await provisionFanout(api, config, [{}]);
    try {
      const place = await api.post(`/api/trades?broker_account_id=${p.brokerAccountId}`, {
        token: p.traderAccess,
        data: {
          instrument_type: 'option',
          symbol: 'AG',
          side: 'buy',
          order_type: 'market',
          quantity: 1,
          option_expiry: '2026-08-14',
          option_strike: 17,
          option_right: 'put',
        },
      });
      expect(place.status(), await place.text()).toBe(201);

      const body = await (await api.get('/api/performance/fanouts', { token: p.traderAccess })).json();
      const row = (body.fanouts as Array<Record<string, unknown>>).find(
        (f) => String(f.symbol).toUpperCase() === 'AG',
      );
      expect(row, 'the AG put fanout is listed').toBeTruthy();
      // contractLabel() renders option_right=put as "P" → "AG P $17 14 Aug 26".
      expect(row!.instrument_type).toBe('option');
      expect(row!.option_right).toBe('put');
      expect(Number(row!.option_strike)).toBe(17);
    } finally {
      p.cleanup();
    }
  });
});
