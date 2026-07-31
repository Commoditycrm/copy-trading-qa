/**
 * AUTHZ-001 (trading) — role guard on order entry. A non-trader hitting require_trader must be refused
 * before any broker call. Manual: manual/test-cases/authz/authz-001__trading-authorization.md
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';

test.describe('AUTHZ-001 Trading role guard', () => {
  test('TC-AUTHZ-001-013 non-trader cannot place an order → 403 trader_only @trading @api @P1 @security', async ({ api }, info) => {
    meta(info, 'AUTHZ-001', ['TRADE-001']);
    const sub = makeUser('subscriber');
    const { access } = await auth.registerAndLogin(api, sub);
    // require_trader fires before the broker-account lookup, so any account id is refused.
    const res = await trades.placeOrder(api, access, '00000000-0000-0000-0000-0000000000aa', marketOrder('AAPL', 1));
    expect(res.status()).toBe(403);
    expect((await res.json()).detail).toBe('trader_only');
  });
});
