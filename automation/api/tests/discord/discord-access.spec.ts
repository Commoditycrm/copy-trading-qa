/**
 * DISCORD access, validation & authZ — the API-level Discord Alerts cases that need neither the
 * discord-listener (Chromium DOM watcher) container nor a broker, so they run on the disposable stack.
 * Requires the discord-webhook build with DISCORD_LISTENER_ENABLED=1 + a DISCORD_LISTENER_TOKEN
 * (docker-compose.discord.yml overlay). Every trader Discord route is gated require_trader + the
 * admin opt-in users.discord_enabled (flipped here via the grey-box enableDiscord helper).
 * Manual: manual/test-cases/discord/discord-alerts.md. LOCAL-QA only.
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import { makeUser } from '../../../common/factory.js';
import { registerAndLogin } from '../../clients/authApi.js';
import { deleteUser, enableDiscord } from '../../../common/localAdmin.js';

const CHANNEL = 'https://discord.com/channels/100000000000000001/200000000000000002';
const SESSION_KEYS = ['present', 'cookie_count', 'captured_at', 'age_days'];

/** Feature detection: internal route exists (401/503) vs absent (404) → run only on the discord build. */
async function discordPresent(api: any): Promise<boolean> {
  const res = await api.get('/api/discord-sources/internal/assignments');
  return res.status() !== 404;
}

async function enabledTrader(api: any, config: any): Promise<{ email: string; token: string }> {
  const u = makeUser('trader');
  const acct = await registerAndLogin(api, u);
  enableDiscord(config, u.email); // admin opt-in; read fresh from the DB on the next request
  return { email: u.email, token: acct.access };
}

test.describe('DISCORD access, validation & authZ', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack built from discord-webhook.');

  test('DA-SEC-06 internal listener endpoints reject a caller with no token @discord @api @P0 @security', async ({
    api,
  }, info) => {
    meta(info, 'DA-SEC');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const res = await api.get('/api/discord-sources/internal/assignments'); // no X-Kopyaa-Listener-Token
    expect([401, 503], 'no listener token → rejected').toContain(res.status());
    expect(res.status(), 'token is configured in the overlay → 401, not 503').toBe(401);
  });

  test('DA-CONN-11 claiming a non-existent pairing code is refused (404) @discord @api @P2', async ({ api }, info) => {
    meta(info, 'DA-CONN');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const res = await api.post('/api/discord-sources/pair/claim', { data: { code: 'no-such-code-000000' } });
    expect(res.status()).toBe(404);
    expect(String((await res.json())?.detail ?? '')).toBe('invalid_or_expired_code');
  });

  test('DA-SEC gate: a subscriber and a non-enabled trader are both blocked @discord @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'DA-SEC');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const sub = makeUser('subscriber');
    const subAcct = await registerAndLogin(api, sub);
    const tr = makeUser('trader'); // fresh trader → discord_enabled defaults false
    const trAcct = await registerAndLogin(api, tr);
    try {
      const subRes = await api.get('/api/discord-sources', { token: subAcct.access });
      expect(subRes.status(), 'subscriber → require_trader').toBe(403);
      expect(String((await subRes.json())?.detail ?? '')).toBe('trader_only');

      const trRes = await api.get('/api/discord-sources', { token: trAcct.access });
      expect(trRes.status(), 'non-enabled trader → feature gate').toBe(403);
      expect(String((await trRes.json())?.detail ?? '')).toBe('discord_not_enabled');
    } finally {
      deleteUser(config, sub.email);
      deleteUser(config, tr.email);
    }
  });

  test('DA-CONN-04/05 channel-URL validation @discord @api @P2', async ({ api, config }, info) => {
    meta(info, 'DA-CONN');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const t = await enabledTrader(api, config);
    try {
      // DA-CONN-04 — a non-Discord URL is a clean 400, not a 500 or a created row.
      const bad = await api.post('/api/discord-sources', {
        token: t.token,
        data: { label: 'QA bad', channel_url: 'https://example.com/x' },
      });
      expect(bad.status(), 'non-Discord URL → 400').toBe(400);
      expect(String((await bad.json())?.detail ?? ''), 'invalid_channel_url reason').toContain('invalid_channel_url');

      // DA-CONN-05 — empty / short URL is a Pydantic 422 (channel_url min_length=10), NOT 400.
      for (const url of ['', '   ']) {
        const res = await api.post('/api/discord-sources', {
          token: t.token,
          data: { label: 'QA empty', channel_url: url },
        });
        expect(res.status(), `URL ${JSON.stringify(url)} → 422`).toBe(422);
      }
    } finally {
      deleteUser(config, t.email);
    }
  });

  test('DA-CONN-06 the same channel twice for one trader is refused (409) @discord @api @P2', async ({
    api,
    config,
  }, info) => {
    meta(info, 'DA-CONN');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const t = await enabledTrader(api, config);
    try {
      const first = await api.post('/api/discord-sources', {
        token: t.token,
        data: { label: 'QA dup', channel_url: CHANNEL },
      });
      expect(first.status(), 'first add → 201').toBe(201);
      const second = await api.post('/api/discord-sources', {
        token: t.token,
        data: { label: 'QA dup 2', channel_url: CHANNEL },
      });
      expect(second.status(), 'duplicate → 409').toBe(409);
      expect(String((await second.json())?.detail ?? '')).toBe('channel_already_connected');
    } finally {
      deleteUser(config, t.email);
    }
  });

  test('DA-CONN-07 two traders may each add the same channel @discord @api @P2', async ({ api, config }, info) => {
    meta(info, 'DA-CONN');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const a = await enabledTrader(api, config);
    const b = await enabledTrader(api, config);
    try {
      const ra = await api.post('/api/discord-sources', {
        token: a.token,
        data: { label: 'QA A', channel_url: CHANNEL },
      });
      const rb = await api.post('/api/discord-sources', {
        token: b.token,
        data: { label: 'QA B', channel_url: CHANNEL },
      });
      expect(ra.status(), 'trader A → 201').toBe(201);
      expect(rb.status(), 'trader B (same channel) → 201 — constraint is per user').toBe(201);
    } finally {
      deleteUser(config, a.email);
      deleteUser(config, b.email);
    }
  });

  test('DA-SEC-01 the sources response body carries no session token or cookies @discord @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'DA-SEC');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const t = await enabledTrader(api, config);
    try {
      await api.post('/api/discord-sources', { token: t.token, data: { label: 'QA safe', channel_url: CHANNEL } });
      const list = await api.get('/api/discord-sources', { token: t.token });
      expect(list.status()).toBe(200);
      const rows = await list.json();
      expect(Array.isArray(rows) && rows.length >= 1).toBeTruthy();
      const session = rows[0].session ?? {};
      // Only the safe descriptor — nothing that could reconstruct the login.
      for (const k of Object.keys(session)) {
        expect(SESSION_KEYS, `unexpected session field '${k}'`).toContain(k);
      }
      const blob = JSON.stringify(rows).toLowerCase();
      for (const leak of ['storage_state', 'authorization', '"token"', 'discord_token', 'x-super-properties']) {
        expect(blob.includes(leak), `response must not leak ${leak}`).toBeFalsy();
      }
    } finally {
      deleteUser(config, t.email);
    }
  });

  test('DA-SEC-05 a trader cannot reach another trader’s source (404) @discord @api @P0 @security', async ({
    api,
    config,
  }, info) => {
    meta(info, 'DA-SEC');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const a = await enabledTrader(api, config);
    const b = await enabledTrader(api, config);
    try {
      const created = await api.post('/api/discord-sources', {
        token: a.token,
        data: { label: 'QA A owns', channel_url: CHANNEL },
      });
      expect(created.status()).toBe(201);
      const id = (await created.json()).id;
      // Trader B tries to read A's source messages and to rename A's source.
      const read = await api.get(`/api/discord-sources/${id}/messages`, { token: b.token });
      expect(read.status(), 'cross-tenant read → 404').toBe(404);
      const rename = await api.patch(`/api/discord-sources/${id}`, { token: b.token, data: { label: 'hijacked' } });
      expect(rename.status(), 'cross-tenant write → 404').toBe(404);
    } finally {
      deleteUser(config, a.email);
      deleteUser(config, b.email);
    }
  });

  test('DA-SIZE-10/11 max-per-contract validation @discord @api @P1', async ({ api, config }, info) => {
    meta(info, 'DA-SIZE');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const t = await enabledTrader(api, config);
    try {
      for (const v of ['0', '-5']) {
        const res = await api.patch('/api/discord-sources/settings', { token: t.token, data: { max_per_contract: v } });
        expect(res.status(), `max_per_contract ${v} → 400`).toBe(400);
        expect(String((await res.json())?.detail ?? '')).toBe('max_per_contract must be positive');
      }
      const nan = await api.patch('/api/discord-sources/settings', {
        token: t.token,
        data: { max_per_contract: 'abc' },
      });
      expect(nan.status()).toBe(400);
      expect(String((await nan.json())?.detail ?? '')).toBe('invalid_max_per_contract');
    } finally {
      deleteUser(config, t.email);
    }
  });

  test('DA-TRAIL-11 trail-percent validation and persistence @discord @api @P1', async ({ api, config }, info) => {
    meta(info, 'DA-TRAIL');
    test.skip(!(await discordPresent(api)), 'Discord feature not present in this build.');
    const t = await enabledTrader(api, config);
    try {
      for (const v of ['0', '150']) {
        const res = await api.patch('/api/discord-sources/settings', { token: t.token, data: { trail_percent: v } });
        expect(res.status(), `trail ${v} → 400`).toBe(400);
        expect(String((await res.json())?.detail ?? '')).toBe('trail_percent must be between 0 and 100');
      }
      const nan = await api.patch('/api/discord-sources/settings', { token: t.token, data: { trail_percent: 'abc' } });
      expect(nan.status()).toBe(400);
      expect(String((await nan.json())?.detail ?? '')).toBe('invalid_trail_percent');

      const ok = await api.patch('/api/discord-sources/settings', { token: t.token, data: { trail_percent: '15' } });
      expect(ok.status(), 'valid trail saves').toBe(200);
      const got = await api.get('/api/discord-sources/settings', { token: t.token });
      expect(String((await got.json())?.trail_percent ?? ''), '15 persists (and formats plainly)').toBe('15');
    } finally {
      deleteUser(config, t.email);
    }
  });
});
