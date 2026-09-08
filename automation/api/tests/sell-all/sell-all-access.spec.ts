/**
 * SELL-ALL access gate (TC-SELL-004-30 / TC-SELL-004-33) — the Sell-All / Snapshot / Re-Entry endpoints are
 * gated by require_sell_all_access: trader-only AND admin-allow-listed (users.sell_all_access, default off).
 * A non-allow-listed trader → 403 `sell_all_access_required`; a subscriber → 403 `trader_only`. Pure authZ:
 * the gate fires before any broker/market interaction, so this runs on the disposable stack (fake broker).
 * Manual: manual/test-cases/sell-all/sell-all-snapshot-reentry.md. LOCAL-QA only (needs the sell-all build).
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin } from '../../clients/authApi.js';
import { deleteUser } from '../../../common/localAdmin.js';

type Ep = { method: 'get' | 'post'; path: string };
const SELL_ALL_ENDPOINTS: Ep[] = [
  { method: 'post', path: '/api/positions/close-all' },
  { method: 'post', path: '/api/positions/re-enter' },
  { method: 'get', path: '/api/positions/snapshots/latest' },
];

async function callEndpoint(api: any, token: string, ep: Ep) {
  return ep.method === 'get' ? api.get(ep.path, { token }) : api.post(ep.path, { token });
}

/** Feature detection: unauthenticated GET → 401 if the route exists, 404 if the sell-all build isn't present.
 *  Lets these tests run only where the feature exists (e.g. the sell-all branch) and skip cleanly elsewhere. */
async function sellAllPresent(api: any): Promise<boolean> {
  const res = await api.get('/api/positions/snapshots/latest');
  return res.status() !== 404;
}

test.describe('SELL-ALL access gate', () => {
  test.skip(
    ({ config }) => config.envName !== 'local',
    'Requires the local stack built from the sell-all feature branch.',
  );

  test('TC-SELL-004-30 a non-allow-listed trader is blocked from the sell-all endpoints (403 sell_all_access_required) @sell-all @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'SELL-004');
    test.skip(!(await sellAllPresent(api)), 'Sell-All feature not present in this build.');
    const u = makeUser('trader'); // fresh trader → users.sell_all_access defaults false (not allow-listed)
    const acct = await registerAndLogin(api, u);
    try {
      for (const ep of SELL_ALL_ENDPOINTS) {
        const res = await callEndpoint(api, acct.access, ep);
        expect(res.status(), `${ep.method.toUpperCase()} ${ep.path} → 403 for a non-allow-listed trader`).toBe(403);
        expect(String((await res.json())?.detail ?? ''), `${ep.path} detail`).toBe('sell_all_access_required');
      }
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-SELL-004-33 a subscriber can never use the sell-all endpoints (403 trader_only) @sell-all @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'SELL-004');
    test.skip(!(await sellAllPresent(api)), 'Sell-All feature not present in this build.');
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    try {
      for (const ep of SELL_ALL_ENDPOINTS) {
        const res = await callEndpoint(api, acct.access, ep);
        expect(res.status(), `${ep.method.toUpperCase()} ${ep.path} → 403 for a subscriber`).toBe(403);
        expect(String((await res.json())?.detail ?? ''), `${ep.path} detail`).toBe('trader_only');
      }
    } finally {
      deleteUser(config, u.email);
    }
  });
});
