/**
 * Trade export (.xlsx) — parse the generated workbook and assert headers/column order, row count,
 * no-secret columns, content-type + filename, the GET side-effect (audit trades.exported), the export
 * count, and admin-only export-for-another-user. LOCAL-QA only. Manual: history/hist-001*.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import * as exp from '../../clients/positionsApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { parseXlsx, locateTable } from '../../../common/xlsx.js';
import { auditByActor } from '../../../common/tradingSetup.js';

const XLSX_MEDIA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test.describe('Trade export (xlsx)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-EXPORT-001-001 export produces a valid xlsx with the expected columns + rows + audit side-effect @portfolio @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'EXPORT-001');
    const p = await provisionFanout(api, config, []);
    try {
      for (const s of ['AAA', 'BBB', 'CCC'])
        await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(s, 3));
      const res = await exp.exportTrades(api, p.traderAccess);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain(XLSX_MEDIA);
      expect(res.headers()['content-disposition']).toContain('kopyya-trades-');
      const { headers, dataRows } = locateTable(await parseXlsx(res), 'Placed At (EST)');
      expect(headers[0]).toBe('Placed At (EST)');
      for (const col of ['Symbol', 'Side', 'Status', 'Quantity', 'Broker Order ID', 'Order ID']) {
        expect(headers, `column ${col}`).toContain(col);
      }
      expect(dataRows.length).toBeGreaterThanOrEqual(3);
      // GET export writes an audit row (documented side-effect)
      expect(auditByActor(config, 'trades.exported', p.traderId)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-EXPORT-001-003 export has no credential columns; count endpoint matches @portfolio @api @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'EXPORT-001');
    const p = await provisionFanout(api, config, []);
    try {
      for (const s of ['AAA', 'BBB'])
        await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(s, 3));
      const { headers } = locateTable(await parseXlsx(await exp.exportTrades(api, p.traderAccess)), 'Placed At (EST)');
      for (const banned of ['Credential', 'API Key', 'Secret', 'Encrypted', 'Password']) {
        expect(
          headers.some((h) => h.toLowerCase().includes(banned.toLowerCase())),
          `no ${banned} column`,
        ).toBe(false);
      }
      const count = await (await exp.exportCount(api, p.traderAccess)).json();
      expect(count.count).toBeGreaterThanOrEqual(2);
    } finally {
      p.cleanup();
    }
  });

  test('TC-EXPORT-001-002 export for another user is admin-only (403 for a non-admin) @portfolio @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'EXPORT-001');
    const p = await provisionFanout(api, config, []);
    const other = await auth.registerAndLogin(api, makeUser('trader'));
    try {
      const res = await exp.exportTrades(api, p.traderAccess, { user_id: other.id });
      expect(res.status()).toBe(403);
      expect((await res.json()).detail).toBe('admin_only');
    } finally {
      p.cleanup();
    }
  });
});
