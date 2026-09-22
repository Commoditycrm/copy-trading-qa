/**
 * OCC classification — the shared parser (app.brokers.alpaca._looks_like_occ / _parse_occ) that
 * fills_sync now uses instead of a len>=18 gate (app 2f9fc46). The Alpaca activity feed the real path
 * reads isn't drivable by the fake broker, so we assert the classifier directly via a grey-box driver
 * action. Covers PDF A1/A5 short tickers, B4 dotted-symbol-stays-stock, B5 odd-strike, B1 long-ticker,
 * and the malformed-OCC guard. Manual: pnl/pnl-006__occ-short-ticker-classification.md. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';

test.describe('OCC classification (shared parser)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-PNL-006-2CLS short / dotted / odd-strike / malformed symbols classify correctly @pnl @api @P1 @functional', async ({
    config,
  }, info) => {
    meta(info, 'PNL-006');
    const mb = new MockBroker(config);
    const { classified } = mb.classifyOcc([
      'T270115C00026000', // A1 1-letter root (16 chars)
      'MU260918C01000000', // 2-letter root (17 chars)
      'NG260320P00003000', // A4-ish put, short root
      'AG260814P00017000', // A5 put
      'VG260626C00010500', // B5 odd strike $10.50
      'AAPL251219C00250000', // B1 long root still an option (19 chars)
      'PNFP.PRB', // B4 preferred/dotted — must stay STOCK
      'F', // plain 1-letter stock
      'META', // plain stock
      'T991332C00026000', // OCC-shaped but impossible date → malformed, not an option
    ]);
    const by = new Map(classified.map((c) => [c.symbol, c]));
    const pick = (s: string): (typeof classified)[number] => {
      const c = by.get(s);
      expect(c, `classified ${s}`).toBeTruthy();
      return c!;
    };

    // short-ticker options are recognized (old len>=18 gate dropped these to STOCK)
    expect(pick('T270115C00026000').is_option).toBe(true);
    expect(pick('T270115C00026000').root).toBe('T');
    expect(pick('T270115C00026000').right).toBe('call');
    expect(pick('MU260918C01000000').is_option).toBe(true);
    expect(pick('MU260918C01000000').root).toBe('MU');
    expect(pick('NG260320P00003000').right).toBe('put');
    expect(pick('AG260814P00017000').root).toBe('AG');
    expect(pick('AG260814P00017000').right).toBe('put');

    // B5 — odd strike parses to 10.50 (…C00010500)
    expect(pick('VG260626C00010500').is_option).toBe(true);
    expect(Number(pick('VG260626C00010500').strike)).toBe(10.5);
    expect(pick('VG260626C00010500').expiry).toBe('2026-06-26');

    // B1 — long-ticker option still recognized (regression)
    expect(pick('AAPL251219C00250000').is_option).toBe(true);
    expect(pick('AAPL251219C00250000').root).toBe('AAPL');

    // B4 — dotted/preferred and plain tickers stay STOCK
    expect(pick('PNFP.PRB').is_option).toBe(false);
    expect(pick('F').is_option).toBe(false);
    expect(pick('META').is_option).toBe(false);

    // malformed OCC-shaped string is not treated as an option (parser guarded, no crash)
    expect(pick('T991332C00026000').is_option).toBe(false);
  });
});
