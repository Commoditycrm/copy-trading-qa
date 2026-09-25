/**
 * OCC retag migration (b6f1d3a9c72e) — repairs rows already written as STOCK that are really short-ticker
 * options (app 2f9fc46 / PR #297). The driver seeds a STOCK-tagged OCC order, runs the migration's retag
 * UPDATE twice, and reports the result. Covers PDF C1 (deployed head), C2 (none left mis-tagged),
 * C3 (fields reconstructed + symbol shortened to root), C5 (idempotent). Manual:
 * pnl/pnl-006__occ-short-ticker-classification.md. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';

test.describe('OCC retag migration', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-PNL-006-3MIG retag repairs a mis-tagged short-ticker option and is idempotent @pnl @api @P1 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'PNL-006', ['MIGRATION']);
    const p = await provisionFanout(api, config, []);
    const mb = new MockBroker(config);
    try {
      const r = mb.occRetagProbe(p.traderId, p.brokerAccountId, 'T270115C00026000');

      // C1 — the retag migration is applied (an ancestor of the live head; the head keeps moving
      // as new migrations land, so we don't pin a fixed revision).
      expect(r.retag_applied, 'C1 — retag migration b6f1d3a9c72e is applied').toBe(true);
      expect(r.rows_changed_first, 'the seeded mis-tagged row is retagged').toBeGreaterThanOrEqual(1);

      // C3 — fields reconstructed from the OCC symbol; symbol shortened to its root.
      expect(r.retagged.instrument_type).toBe('option');
      expect(r.retagged.symbol).toBe('T');
      expect(Number(r.retagged.option_strike)).toBe(26);
      expect(r.retagged.option_expiry).toBe('2027-01-15');
      expect(r.retagged.option_right).toBe('call');

      // C5 — second pass changes nothing (retagged rows no longer match the STOCK+OCC filter).
      expect(r.rows_changed_second, 'C5 — idempotent').toBe(0);
      // C2 — no STOCK rows matching the OCC shape remain.
      expect(r.stock_occ_remaining, 'C2 — none left mis-tagged').toBe(0);
    } finally {
      p.cleanup();
    }
  });
});
