/**
 * Performance page (UI) — the trade table renders the FULL option descriptor, not the bare root.
 * app 4535f4f added contractLabel() in PerformanceView.tsx: an option row shows "VG C $14 18 Sep 26"
 * (root + C/P + $strike + "DD Mon YY" UTC expiry); a stock still shows the bare root. Accounts are
 * API-seeded, the option fanout is placed via the API, then the browser loads /performance.
 * Manual: performance/perf-004__option-contract-descriptor.md.
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser } from '../../common/localAdmin.js';
import { seedFanout } from '../../common/tradingSetup.js';
import * as authApi from '../../api/clients/authApi.js';

test.describe('Performance descriptor (UI)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-PERF-004-003 the performance trade table shows the full option contract descriptor @ui @P2 @integration', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'PERF-004', ['ADMIN-002']);
    const traderU = makeUser('trader');
    const subU = makeUser('subscriber');
    const trader = await authApi.registerAndLogin(api, traderU);
    await authApi.registerAndLogin(api, subU);
    try {
      // one following subscriber so the parent fans out and appears on the performance page.
      const seed = seedFanout(config, traderU.email, [{ email: subU.email }]);
      const place = await api.post(`/api/trades?broker_account_id=${seed.trader_account_id}`, {
        token: trader.access,
        data: {
          instrument_type: 'option',
          symbol: 'VG', // short ticker — the class the OCC-retag fix protects
          side: 'buy',
          order_type: 'market',
          quantity: 1,
          option_expiry: '2026-09-18',
          option_strike: 14,
          option_right: 'call',
        },
      });
      expect(place.status(), await place.text()).toBe(201);

      await seedSession(page, { access: trader.access, refresh: trader.refresh });
      await page.goto('/performance', { waitUntil: 'domcontentloaded' });

      // contractLabel(): option → "VG C $14 18 Sep 26" (a stock would render the bare root "VG").
      await expect(page.getByText('VG C $14 18 Sep 26')).toBeVisible({ timeout: 15000 });
    } finally {
      deleteUser(config, traderU.email);
      deleteUser(config, subU.email);
    }
  });
});
