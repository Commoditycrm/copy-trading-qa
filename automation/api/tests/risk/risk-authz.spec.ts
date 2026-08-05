/**
 * Subscriber settings ownership + role authorization. Endpoints are require_subscriber and self-scoped
 * (keyed on the authenticated user; no path/body user id). LOCAL-QA only.
 * Manual: manual/test-cases/risk-controls/authz-001__settings-authorization.md
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as s from '../../clients/settingsApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { subSetting } from '../../../common/tradingSetup.js';

test.describe('Risk-control settings authorization', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-AUTHZ-001-014 a non-subscriber (trader) cannot access subscriber settings (403) @risk @api @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTHZ-001');
    const p = await provisionFanout(api, config, []); // trader only
    try {
      const res = await s.get(api, p.traderAccess);
      expect(res.status()).toBe(403);
      expect((await res.json()).detail).toBe('subscriber_only');
    } finally {
      p.cleanup();
    }
  });

  test('TC-AUTHZ-001-015 settings are self-scoped — one subscriber cannot affect another @risk @api @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTHZ-001');
    const p = await provisionFanout(api, config, [{}, {}]);
    try {
      const [a, b] = [p.subs[0]!, p.subs[1]!];
      // A changes its own multiplier; there is no path/body user id, so it can only be A's row
      expect((await s.multiplier(api, p.subAccess[0]!, 4)).status()).toBe(200);
      const meRes = await s.get(api, p.subAccess[0]!);
      expect((await meRes.json()).user_id).toBe(a.user_id); // GET returns the caller's own row
      expect(Number(subSetting(config, a.user_id, 'multiplier'))).toBe(4);
      expect(Number(subSetting(config, b.user_id, 'multiplier')), "B's row untouched").toBe(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-AUTHZ-001-016 follow without an approved request is refused (403 follow_not_approved) @risk @api @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTHZ-001', ['FOLLOW-001']);
    const p = await provisionFanout(api, config, []); // provides a trader
    const outsider = makeUser('subscriber');
    const { access } = await auth.registerAndLogin(api, outsider);
    try {
      const res = await s.follow(api, access, p.traderId); // no approved follow-request exists
      expect(res.status()).toBe(403);
      expect((await res.json()).detail).toBe('follow_not_approved');
    } finally {
      p.cleanup();
      // outsider is a namespaced synthetic user; disposable stack is torn down after the run
    }
  });
});
