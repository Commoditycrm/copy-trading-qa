/**
 * Broker Integrations — offline-testable P0/P1 (local-qa, no real credentials, no outbound). Covers
 * connect validation + fake-broker guard, credential encryption-at-rest + redaction, ownership scoping,
 * disconnect, listener-gating settings, and the unauthenticated SnapTrade webhook.
 * Successful Alpaca/IBKR/SnapTrade connects + live listeners require outbound → Blocked (see summary).
 * Manual: manual/test-cases/brokers/*.md
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import * as brokers from '../../clients/brokersApi.js';
import { provisionFanout } from '../trading/helpers.js';
import { brokerAccountField, brokerAccountExists, auditByActor } from '../../../common/tradingSetup.js';

test.describe('Broker Integrations (offline)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  test('TC-BRK-001-001 list returns only the caller’s broker accounts @broker @api @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    const p = await provisionFanout(api, config, []); // trader + one fake broker account
    const attacker = await auth.registerAndLogin(api, makeUser('trader'));
    try {
      const mine = await brokers.list(api, p.traderAccess);
      expect(mine.status()).toBe(200);
      const ids = (await mine.json()).map((a: any) => a.id);
      expect(ids).toContain(p.brokerAccountId);
      const theirs = await brokers.list(api, attacker.access);
      expect(
        (await theirs.json()).some((a: any) => a.id === p.brokerAccountId),
        'no cross-user leak',
      ).toBe(false);
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-001-009 broker=fake is not connectable via the public API (422 unknown broker) @broker @api @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await brokers.connectRaw(api, p.traderAccess, { broker: 'fake', label: 'x' });
      expect(res.status()).toBe(422);
      expect((await res.json()).detail).toBe('unknown broker');
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-001-010 connect with a missing credential block is rejected (422) @broker @api @P1 @negative', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await brokers.connectRaw(api, p.traderAccess, { broker: 'alpaca', label: 'x' }); // no alpaca block
      expect(res.status()).toBe(422);
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-001-011 malformed credentials fail field-length validation (422) @broker @api @P1 @boundary', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await brokers.connectRaw(api, p.traderAccess, {
        broker: 'alpaca',
        label: 'x',
        alpaca: { api_key: 'short', api_secret: 'short' }, // < min 8
      });
      expect(res.status()).toBe(422);
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-001-012 broker credentials are Fernet-encrypted at rest @broker @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    const p = await provisionFanout(api, config, []);
    try {
      const blob = brokerAccountField(config, p.brokerAccountId, 'encrypted_credentials');
      expect(blob.startsWith('gAAAAA'), 'Fernet ciphertext token').toBe(true);
      expect(blob).not.toContain('qa_account_id'); // plaintext must not be stored
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-001-013 broker credentials are never returned in responses @broker @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await brokers.list(api, p.traderAccess);
      const acct = (await res.json()).find((a: any) => a.id === p.brokerAccountId);
      for (const leak of [
        'encrypted_credentials',
        'credentials',
        'api_key',
        'api_secret',
        'signing_key',
        'access_token',
      ]) {
        expect(acct[leak], `must not expose ${leak}`).toBeUndefined();
      }
      expect(acct.connection_status).toBe('connected');
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-001-004 disconnect removes the account (204 + audit) @broker @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await brokers.disconnect(api, p.traderAccess, p.brokerAccountId);
      expect(res.status()).toBe(204);
      expect(brokerAccountExists(config, p.brokerAccountId)).toBe(false);
      expect(auditByActor(config, 'broker.deleted', p.traderId)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-AUTHZ-001-017 another user cannot refresh/settings/disconnect your broker (404) @broker @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'AUTHZ-001', ['BRK-001']);
    const p = await provisionFanout(api, config, []);
    const attacker = await auth.registerAndLogin(api, makeUser('trader'));
    try {
      expect((await brokers.refreshBalance(api, attacker.access, p.brokerAccountId)).status()).toBe(404);
      expect(
        (await brokers.updateSettings(api, attacker.access, p.brokerAccountId, { auto_pull_orders: false })).status(),
      ).toBe(404);
      const del = await brokers.disconnect(api, attacker.access, p.brokerAccountId);
      expect(del.status()).toBe(404);
      expect(brokerAccountExists(config, p.brokerAccountId), 'not deleted by a non-owner').toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-004-001 listener-gating settings persist + audit @broker @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-004');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await brokers.updateSettings(api, p.traderAccess, p.brokerAccountId, {
        auto_pull_orders: false,
        bring_open_orders: false,
      });
      expect(res.status()).toBe(200);
      expect(brokerAccountField(config, p.brokerAccountId, 'auto_pull_orders')).toBe('false');
      expect(brokerAccountField(config, p.brokerAccountId, 'bring_open_orders')).toBe('false');
      expect(auditByActor(config, 'broker.settings_updated', p.traderId)).toBeGreaterThanOrEqual(1);
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-003-001 SnapTrade webhook with a valid userId acks 200 @broker @api @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-003');
    const p = await provisionFanout(api, config, []);
    try {
      const res = await brokers.snaptradeWebhook(api, { userId: p.traderId, eventType: 'ORDER_EXECUTED' });
      expect(res.status()).toBe(200);
      expect((await res.json()).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  test('TC-BRK-003-002 SnapTrade webhook is UNAUTHENTICATED — a forged call is accepted (poll-amplification finding) @broker @api @P1 @security', async ({
    api,
  }, info) => {
    meta(info, 'BRK-003');
    // No auth/signature is required — documents the accepted risk (baseline §15.3). A forged call for a
    // known trader id schedules an extra poll (no fake-trade injection; SnapTrade dedups by broker id).
    const res = await brokers.snaptradeWebhook(api, {
      userId: '00000000-0000-0000-0000-0000000000aa',
      eventType: 'ORDER_EXECUTED',
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test('TC-BRK-003-003 SnapTrade webhook with missing/non-UUID userId is acked with no action @broker @api @P2 @negative', async ({
    api,
  }, info) => {
    meta(info, 'BRK-003');
    expect((await (await brokers.snaptradeWebhook(api, { eventType: 'x' })).json()).ok).toBe(true); // no userId
    expect((await (await brokers.snaptradeWebhook(api, { userId: 'not-a-uuid' })).json()).ok).toBe(true);
  });

  test('TC-BRK-002-009 SnapTrade start + finish return 503 when the integration is not configured @broker @api @P2 @negative', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-002');
    // Both endpoints gate on _ensure_snaptrade_configured first, so with SnapTrade unset they 503 before
    // any outbound call. (The no_snaptrade_session 400 branch sits behind this gate — reaching it needs a
    // configured SnapTrade + outbound, so it stays Blocked; see the execution summary.)
    const p = await provisionFanout(api, config, []);
    try {
      expect((await brokers.snaptradeStart(api, p.traderAccess)).status()).toBe(503);
      expect((await brokers.snaptradeFinish(api, p.traderAccess)).status()).toBe(503);
    } finally {
      p.cleanup();
    }
  });
});
