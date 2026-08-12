/**
 * Direct-Webull integration — supply-chain + safety regression coverage (SA-WEBULL-* / TC-BRK-WEBULL-*).
 *
 * Context: the May-2026 prod compromise came from the UNOFFICIAL `webull==0.6.1` (tedchou12) PyPI package,
 * which executed a scanner at import on every boot. Direct-Webull was re-introduced (qa-branch/main) using
 * the OFFICIAL `webull-openapi-python-sdk`, imported LAZILY and gated off/shadow by default. These tests are
 * the automated guardrails for that: the compromised package must stay gone, the SDK must never import at
 * boot, the feature must default off/shadow, and the connect gate must reject Webull while disabled.
 *
 * The suite auto-SKIPS on any build that predates the feature (e.g. the d8724f5 QA baseline, whose
 * `broker_name` enum has no 'webull') so it stays green there and only asserts where Webull exists.
 * LOCAL-QA only (grey-box via docker exec).
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin } from '../../clients/authApi.js';
import { deleteUser } from '../../../common/localAdmin.js';
import * as brokers from '../../clients/brokersApi.js';
import {
  webullFeaturePresent,
  brokerEnumLabels,
  pipShow,
  webullSdkImportedByAdapter,
  webullFlags,
} from '../../../common/webull.js';

test.describe('Direct-Webull supply-chain & safety guards', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack (grey-box docker exec).');

  const skipIfAbsent = (config: any) =>
    test.skip(!webullFeaturePresent(config), 'Direct-Webull feature not present in this build (pre-feature baseline).');

  test('SA-WEBULL-001 the compromised unofficial `webull` package is absent; only the official SDK is installed @security @api @webull @P0 @supply-chain', async ({
    config,
  }, info) => {
    meta(info, 'BRK-001');
    skipIfAbsent(config);
    // The compromised dependency was `webull` (tedchou12). Its distribution must NOT be installed.
    const compromised = pipShow(config, 'webull');
    await info.attach('pip-show-webull', { body: compromised || '(absent)', contentType: 'text/plain' });
    expect(compromised, 'the unofficial `webull` distribution must not be installed').toBe('');
    // The official SDK (different distribution) powers the direct integration.
    const official = pipShow(config, 'webull-openapi-python-sdk');
    expect(official, 'official webull-openapi-python-sdk must be installed').toContain('webull-openapi-python-sdk');
  });

  test('SA-WEBULL-002 the Webull SDK is NOT imported at boot — the adapter imports it lazily @security @api @webull @P0 @supply-chain', async ({
    config,
  }, info) => {
    meta(info, 'BRK-001');
    skipIfAbsent(config);
    // Importing the adapter module must not pull the `webull` SDK into sys.modules (the old package ran a
    // scanner at import — lazy import is the fix). If this leaks, the import-time-execution vector is back.
    expect(webullSdkImportedByAdapter(config), 'importing app.brokers.webull must not load the webull SDK').toBe(false);
  });

  test('SA-WEBULL-003 direct-Webull defaults to the safe state (disabled + shadow) @security @api @webull @P1 @security', async ({
    config,
  }, info) => {
    meta(info, 'BRK-001');
    skipIfAbsent(config);
    const flags = webullFlags(config);
    expect(flags.enabled, 'webull_direct_enabled must default OFF').toBe(false);
    expect(flags.shadow, 'webull_direct_shadow_mode must default ON').toBe(true);
  });

  test('TC-BRK-WEBULL-001 connecting Webull is rejected while the feature is disabled (400) @broker @api @webull @P1 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'BRK-001');
    skipIfAbsent(config);
    const u = makeUser('trader');
    const acct = await registerAndLogin(api, u);
    try {
      // Schema-valid but fake credentials (min-length app_key/app_secret≥8, account_id≥4): the
      // webull_direct_enabled gate fires before any outbound connection — no real Webull creds are used.
      const res = await brokers.connectRaw(api, acct.access, {
        broker: 'webull',
        label: 'wb-off',
        webull: { app_key: 'dummyappkey123', app_secret: 'dummyappsecret123', account_id: 'acct1234', region_id: 'us' },
      });
      expect(res.status(), 'disabled Webull connect must be rejected').toBe(400);
      const detail = String((await res.json())?.detail ?? '');
      await info.attach('reject-detail', { body: detail, contentType: 'text/plain' });
      expect(detail).toContain('webull_direct_enabled is off');
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-BRK-WEBULL-002 `webull` is a registered value of the broker_name enum @broker @api @webull @P2 @data-integrity', async ({
    config,
  }, info) => {
    meta(info, 'BRK-001');
    skipIfAbsent(config);
    const labels = brokerEnumLabels(config);
    expect(labels, 'broker_name enum carries webull').toContain('webull');
  });
});
