/**
 * SELL-ALL access gate (TC-SELL-004-30 / TC-SELL-004-33, incl. Snapshot-of-the-Day TC-SNAP-006-14) — the
 * Sell-All / Snapshot / Re-Entry endpoints are gated by require_sell_all_access: a TRADER *or* SUBSCRIBER who
 * is admin-allow-listed (users.sell_all_access, default off). App commit 4ccccef opened the suite to
 * subscribers, so a non-allow-listed trader AND a non-allow-listed subscriber both → 403
 * `sell_all_access_required` (the old subscriber-only `trader_only` reply is gone). Pure authZ: the gate fires
 * before any broker/market interaction, so this runs on the disposable stack (fake broker). The
 * `snapshots/today` endpoint (the stacked day view) rides the same gate. Manual:
 * manual/test-cases/sell-all/{sell-all-snapshot-reentry,snapshot-of-the-day}.md. LOCAL-QA only (sell-all build).
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
  { method: 'get', path: '/api/positions/snapshots/today' }, // TC-SNAP-006-14 — stacked day view, same gate
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

  test('TC-SELL-004-33 a non-allow-listed subscriber is blocked from the sell-all endpoints (403 sell_all_access_required) @sell-all @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'SELL-004');
    test.skip(!(await sellAllPresent(api)), 'Sell-All feature not present in this build.');
    // Since app 4ccccef subscribers are allow-listable too, so a fresh (un-listed) subscriber is gated
    // exactly like a trader — 403 sell_all_access_required, not the old trader_only.
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    try {
      for (const ep of SELL_ALL_ENDPOINTS) {
        const res = await callEndpoint(api, acct.access, ep);
        expect(res.status(), `${ep.method.toUpperCase()} ${ep.path} → 403 for a non-allow-listed subscriber`).toBe(403);
        expect(String((await res.json())?.detail ?? ''), `${ep.path} detail`).toBe('sell_all_access_required');
      }
    } finally {
      deleteUser(config, u.email);
    }
  });
});
