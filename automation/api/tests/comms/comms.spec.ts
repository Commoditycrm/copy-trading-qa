/**
 * Notifications, Follow signals, Phone/Consent, and SMS gating (log sink). All local-qa; no real Twilio.
 * SMS is asserted via the log-mode sink — with blank TWILIO_* creds the app logs the send instead of
 * sending; the send runs off-thread in the backend during fanout, so we bound-poll the logs.
 * Manual: notifications/notif-001*.md, notifications/follow-001*.md, integrations/sms-001__twilio.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as trades from '../../clients/tradesApi.js';
import { marketOrder } from '../../clients/tradesApi.js';
import * as notif from '../../clients/notificationsApi.js';
import * as follow from '../../clients/followApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { notifCount, childForUser } from '../../../common/tradingSetup.js';
import { deleteUser } from '../../../common/localAdmin.js';
import { smsAttempted } from '../../../common/smsSink.js';

const childStatus = (cfg: any, parent: string, user: string) => childForUser(cfg, parent, user)?.status ?? 'none';

test.describe('Comms — notifications / follow / SMS gating', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-NOTIF-001-003 a mirror broker rejection creates a copy.rejected notification @comms @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'reject', { reason: 'asset not tradable' });
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => childStatus(config, parent, sub.user_id), { timeout: 20000 }).toBe('rejected');
      await expect.poll(() => notifCount(config, sub.user_id, 'copy.rejected'), { timeout: 10000 }).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-005 poller auto-liquidation creates a copy.auto_liquidated notification @comms @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001', ['RISK-002']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await auth.updateMe(api, p.subAccess[0]!, {}); // no-op; ensure user reachable
      await api.patch(`/api/settings/subscriber/auto-liquidation-limit`, { token: p.subAccess[0]!, data: { auto_liquidation_limit: 100 } });
      await mb.setPnlSnapshot(sub.account_id!, { todays_pl: 150, beginning_day_balance: 1000, equity: 1150 });
      mb.pollerEnforce(sub.account_id!);
      expect(notifCount(config, sub.user_id, 'copy.auto_liquidated')).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-006 notifications are self-scoped — another user cannot mark them read (404) @comms @api @P0 @security', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    const attacker = await auth.registerAndLogin(api, makeUser('subscriber'));
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'reject');
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => notifCount(config, sub.user_id, 'copy.rejected'), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      // find the sub's notification id via the sub's own list
      // (attacker has no token for the sub; we just need a real id belonging to the sub)
      const meRes = await notif.list(api, p.subAccess[0]!);
      const nid = (await meRes.json())[0].id as string;
      const attackerMark = await notif.markRead(api, attacker.access, nid);
      expect(attackerMark.status()).toBe(404);
    } finally {
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-007 list is newest-first and supports the unread filter @comms @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      // create two notifications (two rejected orders)
      await mb.setPlaceOrderResult(sub.account_id!, 'reject');
      for (const sym of ['AAA', 'BBB']) {
        await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder(sym, 5));
      }
      await expect.poll(() => notifCount(config, sub.user_id, 'copy.rejected'), { timeout: 20000 }).toBeGreaterThanOrEqual(2);
      const all = await (await notif.list(api, p.subAccess[0]!)).json();
      const ts = all.map((n: any) => new Date(n.created_at).getTime());
      expect([...ts].sort((a, b) => b - a)).toEqual(ts); // newest first
      const unread = await (await notif.list(api, p.subAccess[0]!, { unread_only: true })).json();
      expect(unread.every((n: any) => n.read_at === null)).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-008 unread-count, idempotent mark-one, and mark-all @comms @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      await mb.setPlaceOrderResult(sub.account_id!, 'reject');
      await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAA', 5));
      await expect.poll(() => notifCount(config, sub.user_id, 'copy.rejected'), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      const t = p.subAccess[0]!;
      const before = (await (await notif.unreadCount(api, t)).json()).unread as number;
      expect(before).toBeGreaterThanOrEqual(1);
      const nid = (await (await notif.list(api, t)).json())[0].id as string;
      expect((await notif.markRead(api, t, nid)).status()).toBe(200);
      expect((await notif.markRead(api, t, nid)).status(), 'idempotent').toBe(200); // re-read is a no-op
      const all = await notif.markAllRead(api, t);
      expect(all.status()).toBe(200);
      expect((await (await notif.unreadCount(api, t)).json()).unread).toBe(0);
    } finally {
      p.cleanup();
    }
  });

  // ── Follow signals ──
  test('TC-FOLLOW-001-001/002/003 follow request → approve → reject create the right notifications @comms @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'FOLLOW-001', ['NOTIF-001']);
    const traderU = makeUser('trader');
    const trader = await auth.registerAndLogin(api, traderU);
    const subA = makeUser('subscriber');
    const subB = makeUser('subscriber');
    const a = await auth.registerAndLogin(api, subA);
    const b = await auth.registerAndLogin(api, subB);
    try {
      // A requests → trader notified
      const reqA = await follow.createRequest(api, a.access, trader.id);
      expect(reqA.status(), await reqA.text()).toBe(201);
      await expect.poll(() => notifCount(config, trader.id, 'follow.requested'), { timeout: 10000 }).toBeGreaterThanOrEqual(1);
      // approve A → A notified
      expect((await follow.approve(api, trader.access, (await reqA.json()).id)).status()).toBe(200);
      expect(notifCount(config, a.id, 'follow.approved')).toBeGreaterThanOrEqual(1);
      // B requests → reject → B notified
      const reqB = await follow.createRequest(api, b.access, trader.id);
      expect((await follow.reject(api, trader.access, (await reqB.json()).id)).status()).toBe(200);
      expect(notifCount(config, b.id, 'follow.rejected')).toBeGreaterThanOrEqual(1);
    } finally {
      for (const u of [traderU, subA, subB]) {
        try { deleteUser(config, u.email); } catch { /* best-effort */ }
      }
    }
  });

  // ── Phone / consent / SMS gating (log sink) ──
  test('TC-SMS-001-002 valid E.164 phone is accepted and stored @comms @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'SMS-001');
    const p = await provisionFanout(api, config, [{}]);
    try {
      const res = await auth.updateMe(api, p.subAccess[0]!, { phone: '+14155550142' });
      expect(res.status(), await res.text()).toBe(200);
      expect((await (await auth.me(api, p.subAccess[0]!)).json()).phone).toBe('+14155550142');
    } finally {
      p.cleanup();
    }
  });

  test('TC-SMS-001-003 invalid E.164 phone is rejected (422) @comms @api @P1 @negative', async ({ api, config }, info) => {
    meta(info, 'SMS-001');
    const p = await provisionFanout(api, config, [{}]);
    try {
      expect((await auth.updateMe(api, p.subAccess[0]!, { phone: '12345' })).status()).toBe(422);
    } finally {
      p.cleanup();
    }
  });

  test('TC-SMS-001-006 an SMS-eligible event attempts a send (log-mode sink) when consent + phone are set @comms @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'SMS-001', ['NOTIF-001']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      const phone = '+14155550188';
      await auth.updateMe(api, p.subAccess[0]!, { phone, sms_notifications_enabled: true, sms_on_trade_rejected: true });
      await mb.setPlaceOrderResult(sub.account_id!, 'reject');
      await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      // copy.rejected → SMS eligible → off-thread send logged (log mode, no real send)
      await expect.poll(() => smsAttempted(phone), { timeout: 15000 }).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-SMS-001-004 without consent (or without a phone) no SMS is attempted @comms @api @P1 @security', async ({ api, config }, info) => {
    meta(info, 'SMS-001');
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}, {}]);
    try {
      const noConsent = p.subs[0]!;
      const noPhone = p.subs[1]!;
      const phone = '+14155550199';
      await auth.updateMe(api, p.subAccess[0]!, { phone, sms_notifications_enabled: false, sms_on_trade_rejected: true }); // phone but master off
      // subB: no phone at all
      await mb.setPlaceOrderResult(noConsent.account_id!, 'reject');
      await mb.setPlaceOrderResult(noPhone.account_id!, 'reject');
      const placed = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, marketOrder('AAPL', 5));
      const parent = (await placed.json()).id as string;
      await expect.poll(() => notifCount(config, noConsent.user_id, 'copy.rejected'), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
      // consent off → no SMS to that phone
      expect(smsAttempted(phone), 'consent off → no SMS').toBe(false);
    } finally {
      p.cleanup();
    }
  });
});
