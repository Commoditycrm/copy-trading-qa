/**
 * SSE event bus — a REAL local SSE consumer connects to GET /api/events?token=, and events are driven
 * via the grey-box `events.publish`, correlated by an injected run_id. No fixed sleeps: bounded polling
 * of the consumer buffer. LOCAL-QA only. Manual: notifications/notif-001__sse-event-bus.md.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser, RUN_ID } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { mintExpiredAccess } from '../../../common/jwt.js';
import { provisionFanout } from '../trading/helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { openSse, sseStatus } from '../../../common/sseClient.js';
import { deactivateUser, deleteUser } from '../../../common/localAdmin.js';

test.describe('SSE event bus', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-NOTIF-001-016 events are delivered to the owner only — cross-user channel isolation @comms @api @P0 @security', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    const p = await provisionFanout(api, config, [{}, {}]);
    const a = await openSse(config, p.subAccess[0]!);
    const b = await openSse(config, p.subAccess[1]!);
    try {
      await a.waitForRaw((l) => l.startsWith(': connected'), 8000);
      await b.waitForRaw((l) => l.startsWith(': connected'), 8000);
      const tag = `${RUN_ID}-iso`;
      mb.emitSse(p.subs[0]!.user_id, { type: 'qa.test', run_id: tag });
      expect(await a.waitFor((e) => e.run_id === tag, 10000), 'owner receives').toBeTruthy();
      expect(await b.waitFor((e) => e.run_id === tag, 3000), 'other user must NOT receive').toBeNull();
    } finally {
      a.close();
      b.close();
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-009 a created notification is delivered live as notification.created @comms @api @P1 @integration', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    const p = await provisionFanout(api, config, [{}]);
    const c = await openSse(config, p.subAccess[0]!);
    try {
      await c.waitForRaw((l) => l.startsWith(': connected'), 8000);
      mb.createNotif(p.subs[0]!.user_id, 'qa.live', 'hello');
      const ev = await c.waitFor((e) => e.type === 'notification.created', 10000);
      expect(ev, 'notification.created delivered').toBeTruthy();
      expect(ev!.notification?.type).toBe('qa.live');
    } finally {
      c.close();
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-021 events arrive in order with no duplicate delivery @comms @api @P1 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    const p = await provisionFanout(api, config, [{}]);
    const c = await openSse(config, p.subAccess[0]!);
    try {
      await c.waitForRaw((l) => l.startsWith(': connected'), 8000);
      const tag = `${RUN_ID}-ord`;
      mb.emitSseBurst(p.subs[0]!.user_id, Array.from({ length: 5 }, (_, i) => ({ type: 'qa.seq', run_id: tag, seq: i })));
      await c.waitFor((e) => e.run_id === tag && e.seq === 4, 10000);
      const seqs = c.events.filter((e) => e.run_id === tag).map((e) => e.seq);
      expect(seqs, 'in order, exactly once').toEqual([0, 1, 2, 3, 4]);
    } finally {
      c.close();
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-022 high-volume events are all delivered @comms @api @P2 @integration', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const mb = new MockBroker(config);
    const p = await provisionFanout(api, config, [{}]);
    const c = await openSse(config, p.subAccess[0]!);
    try {
      await c.waitForRaw((l) => l.startsWith(': connected'), 8000);
      const tag = `${RUN_ID}-vol`;
      const N = 20;
      mb.emitSseBurst(p.subs[0]!.user_id, Array.from({ length: N }, (_, i) => ({ type: 'qa.vol', run_id: tag, seq: i })));
      await c.waitFor((e) => e.run_id === tag && e.seq === N - 1, 15000);
      expect(c.events.filter((e) => e.run_id === tag).length).toBe(N);
    } finally {
      c.close();
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-017 the stream emits a connected preamble and a heartbeat @comms @api @P2 @observability', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const p = await provisionFanout(api, config, [{}]);
    const c = await openSse(config, p.subAccess[0]!);
    try {
      expect(await c.waitForRaw((l) => l.startsWith(': connected'), 8000), 'connected preamble').toBeTruthy();
      expect(await c.waitForRaw((l) => l.includes('heartbeat'), 26000), 'heartbeat within ~20s').toBeTruthy();
    } finally {
      c.close();
      p.cleanup();
    }
  });

  test('TC-NOTIF-001-018 SSE auth — invalid, expired, and inactive-user tokens are rejected (401) @comms @api @P0 @security', async ({ api, config }, info) => {
    meta(info, 'NOTIF-001');
    const u = makeUser('subscriber');
    const acct = await auth.registerAndLogin(api, u);
    try {
      expect(await sseStatus(config, 'garbage.not.a.jwt'), 'invalid token').toBe(401);
      expect(await sseStatus(config, mintExpiredAccess(config, acct.id, 'subscriber')), 'expired token').toBe(401);
      deactivateUser(config, u.email);
      expect(await sseStatus(config, acct.access), 'inactive user').toBe(401);
      // NOTE: the token travels in the query string (EventSource can't set headers) — access-log exposure
      // is tracked as a Potential (baseline §24), not asserted as a failure here.
    } finally {
      deleteUser(config, u.email);
    }
  });
});
