/**
 * Options chain — the offline surfaces: Alpaca-only enforcement (501 for a fake account), validation
 * (422), ownership (404), and the /quote debug-mode disclosure. Live Alpaca contract/quote data is
 * outbound → Blocked. LOCAL-QA only. Manual: options/opt-001__options-chain.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as opt from '../../clients/positionsApi.js';
import { provisionFanout } from '../trading/helpers.js';

const EXPIRY = '2026-12-18';

test.describe('Options chain (offline surfaces)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-OPT-001-005 expiries/strikes are Alpaca-only (501 for a fake account) and validate params @options @api @P1 @negative', async ({ api, config }, info) => {
    meta(info, 'OPT-001');
    const p = await provisionFanout(api, config, []);
    try {
      expect((await opt.optExpiries(api, p.traderAccess, p.brokerAccountId, 'AAPL')).status()).toBe(501);
      expect((await opt.optStrikes(api, p.traderAccess, p.brokerAccountId, 'AAPL', EXPIRY)).status()).toBe(501);
      // validation (before the Alpaca gate would not matter — schema/query validation is 422)
      expect((await opt.optQuote(api, p.traderAccess, p.brokerAccountId, 'AAPL', EXPIRY, -1)).status()).toBe(422); // strike gt=0
      expect((await opt.optStrikes(api, p.traderAccess, p.brokerAccountId, 'AAPL', EXPIRY, 'bogus')).status()).toBe(422); // right pattern
    } finally {
      p.cleanup();
    }
  });

  test('TC-OPT-001-004 quote for a fake account returns nulls; debug=1 discloses adapter internals @options @api @P2 @security', async ({ api, config }, info) => {
    meta(info, 'OPT-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await opt.optQuote(api, p.traderAccess, p.brokerAccountId, 'AAPL', EXPIRY, 200, 'call', 1);
      expect(res.status()).toBe(200);
      const q = await res.json();
      expect(q.bid ?? null, 'no live quote on the fake adapter').toBeNull();
      expect(q.mid ?? null).toBeNull();
      // debug=1 attaches an internals dict (adapter class / has-method) — disclosure, tracked as a finding
      expect(q._debug, 'debug mode discloses adapter internals').toBeTruthy();
      expect(q._debug.has_quote_method).toBe(false);
    } finally {
      p.cleanup();
    }
  });

  test('TC-OPT-001-006 options endpoints are owner-scoped — another user gets 404 @options @api @P1 @security', async ({ api, config }, info) => {
    meta(info, 'OPT-001');
    const p = await provisionFanout(api, config, []);
    const attacker = await auth.registerAndLogin(api, makeUser('trader'));
    try {
      expect((await opt.optQuote(api, attacker.access, p.brokerAccountId, 'AAPL', EXPIRY, 200)).status()).toBe(404);
      expect((await opt.optExpiries(api, attacker.access, p.brokerAccountId, 'AAPL')).status()).toBe(404);
    } finally {
      p.cleanup();
    }
  });
});
