/**
 * Direct-Webull CONNECTION coverage (TC-BRK-WEBULL-003…007) — the enabled-path connect/verify/persist/
 * disconnect flow, exercised against a QA MOCK Webull adapter (mock-broker/qa_webull_broker.py) with NO real
 * SDK, credentials, or network.
 *
 * These require the webull-ENABLED stack (webull_direct_enabled on + the mock mounted):
 *   npm run local:up:full
 *   npm run local:webull:enable      # applies docker-compose.webull.yml (enable + mock + inert worker)
 *   npx playwright test --project=api -g "@webull-connect"
 *
 * They auto-SKIP on the default stack (webull OFF) and on the pre-feature baseline, so the shared suite is
 * unaffected. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin } from '../../clients/authApi.js';
import { deleteUser } from '../../../common/localAdmin.js';
import * as brokers from '../../clients/brokersApi.js';
import { webullEnabled, webullAccountRow } from '../../../common/webull.js';

const validCreds = (over: Record<string, unknown> = {}) => ({
  app_key: 'qaAppKey123456',
  app_secret: 'qaSecretDoNotLog98765',
  account_id: 'wbacct1234',
  region_id: 'us',
  ...over,
});

test.describe('Direct-Webull connection (mock adapter)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack.');

  const needEnabled = (config: any) =>
    test.skip(!webullEnabled(config), 'Requires the webull-enabled stack (docker-compose.webull.yml).');

  test('TC-BRK-WEBULL-003 a trader connects Webull-direct — verify succeeds and the account persists @broker @api @webull @webull-connect @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    needEnabled(config);
    const u = makeUser('trader');
    const acct = await registerAndLogin(api, u);
    try {
      const res = await brokers.connectRaw(api, acct.access, { broker: 'webull', label: 'wb', webull: validCreds() });
      expect(res.status(), await res.text()).toBe(201);
      const body = await res.json();
      expect(body.broker).toBe('webull');
      const row = webullAccountRow(config, acct.id);
      expect(row, 'a webull broker_account row is persisted').not.toBeNull();
      expect(row?.status, 'connection_status=connected after verify').toBe('connected');
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-BRK-WEBULL-004 connected Webull credentials are stored Fernet-encrypted at rest @broker @api @webull @webull-connect @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    needEnabled(config);
    const u = makeUser('trader');
    const acct = await registerAndLogin(api, u);
    const secret = `qaSecretDoNotLog-${Date.now()}`;
    try {
      const res = await brokers.connectRaw(api, acct.access, {
        broker: 'webull',
        label: 'wb',
        webull: validCreds({ app_secret: secret }),
      });
      expect(res.status(), await res.text()).toBe(201);
      const row = webullAccountRow(config, acct.id);
      expect(row, 'row persisted').not.toBeNull();
      expect(row!.enc.length, 'encrypted_credentials is populated').toBeGreaterThan(0);
      expect(row!.enc.startsWith('gAAAAA'), 'looks like a Fernet token, not plaintext JSON').toBe(true);
      expect(row!.enc.includes(secret), 'the plaintext app_secret must NOT appear at rest').toBe(false);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-BRK-WEBULL-005 a failed verify does not persist a ghost account @broker @api @webull @webull-connect @P1 @data-integrity', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    needEnabled(config);
    const u = makeUser('trader');
    const acct = await registerAndLogin(api, u);
    try {
      // FAILVERIFY app_key makes the mock adapter's verify_connection raise.
      const res = await brokers.connectRaw(api, acct.access, {
        broker: 'webull',
        label: 'wb',
        webull: validCreds({ app_key: 'FAILVERIFY12345' }),
      });
      expect(res.status(), 'verify failure is rejected').toBe(400);
      expect(String((await res.json())?.detail ?? '')).toContain('broker_error');
      expect(webullAccountRow(config, acct.id), 'no broker_account persisted when verify fails').toBeNull();
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-BRK-WEBULL-006 a connected Webull account can be disconnected @broker @api @webull @webull-connect @P1 @integration', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    needEnabled(config);
    const u = makeUser('trader');
    const acct = await registerAndLogin(api, u);
    try {
      const res = await brokers.connectRaw(api, acct.access, { broker: 'webull', label: 'wb', webull: validCreds() });
      expect(res.status(), await res.text()).toBe(201);
      const id = (await res.json()).id as string;
      const del = await brokers.disconnect(api, acct.access, id);
      expect(del.status(), 'disconnect returns 204').toBe(204);
      expect(webullAccountRow(config, acct.id), 'row removed after disconnect').toBeNull();
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-BRK-WEBULL-007 a subscriber cannot connect Webull-direct (traders only) @broker @api @webull @webull-connect @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    needEnabled(config);
    const u = makeUser('subscriber');
    const acct = await registerAndLogin(api, u);
    try {
      const res = await brokers.connectRaw(api, acct.access, { broker: 'webull', label: 'wb', webull: validCreds() });
      expect(res.status(), 'subscriber webull-direct connect is blocked').toBe(400);
      expect(String((await res.json())?.detail ?? '')).toContain('traders only');
      expect(webullAccountRow(config, acct.id), 'nothing persisted').toBeNull();
    } finally {
      deleteUser(config, u.email);
    }
  });
});
