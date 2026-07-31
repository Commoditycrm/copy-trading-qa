/**
 * TC-AUTH-001-008 — Registration IP rate limiting. Manual: manual/test-cases/auth/auth-001__register.md
 * LOCAL-ONLY: uses a dedicated test IP and resets the `rl:register:ip:<ip>` key before AND after, so it
 * never disturbs shared rate-limit state. App limit: 15 registrations / hour / IP.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser, makeIp } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { delRateLimitKey } from '../../../common/localRedis.js';

test.describe('AUTH-001 Register — rate limiting', () => {
  test('TC-AUTH-001-008 registration IP throttle returns 429 + Retry-After @auth @api @P2 @recovery @requires-local', async ({ api, config }, info) => {
    meta(info, 'AUTH-001');
    test.skip(config.envName !== 'local', 'Rate-limit test runs only against the local stack (Redis key isolation).');

    const ip = makeIp();
    const key = `rl:register:ip:${ip}`;
    delRateLimitKey(config, key); // isolate: clear any prior counter for this IP
    try {
      let saw429 = false;
      let successes = 0;
      for (let i = 0; i < 20; i += 1) {
        const u = makeUser('subscriber', { clientIp: ip });
        const r = await auth.register(api, u);
        if (r.status() === 201) successes += 1;
        else if (r.status() === 429) {
          saw429 = true;
          expect((await r.json()).detail).toBe('too_many_requests');
          expect(r.headers()['retry-after'], 'Retry-After header on 429').toBeTruthy();
          break;
        }
      }
      expect(successes, 'should allow up to the 15/hour limit before throttling').toBeGreaterThanOrEqual(15);
      expect(saw429, 'expected a 429 after crossing the 15/hour register limit').toBe(true);
    } finally {
      delRateLimitKey(config, key); // cleanup: do not leave shared state altered
    }
  });
});
