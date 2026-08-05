/**
 * Broker API client — /api/brokers/*. Connect only routes to Alpaca/IBKR (both require outbound), so
 * offline tests exercise validation / ownership / disconnect / redaction and the unauthenticated
 * SnapTrade webhook. All mutations go through SafeApi.
 */
import type { APIResponse } from '@playwright/test';
import type { SafeApi } from '../../common/api.js';

const P = '/api/brokers';

export const list = (api: SafeApi, token: string): Promise<APIResponse> => api.get(P, { token });

/** POST /api/brokers with an arbitrary body (used for validation / unknown-broker / missing-creds cases). */
export const connectRaw = (api: SafeApi, token: string, body: Record<string, unknown>): Promise<APIResponse> =>
  api.post(P, { token, data: body });

export const disconnect = (api: SafeApi, token: string, accountId: string): Promise<APIResponse> =>
  api.delete(`${P}/${accountId}`, { token });

export const refreshBalance = (api: SafeApi, token: string, accountId: string): Promise<APIResponse> =>
  api.post(`${P}/${accountId}/refresh-balance`, { token });

export const updateSettings = (
  api: SafeApi,
  token: string,
  accountId: string,
  body: Record<string, unknown>,
): Promise<APIResponse> => api.patch(`${P}/${accountId}/settings`, { token, data: body });

// ── SnapTrade (offline-reachable branches only) ──
export const snaptradeStart = (api: SafeApi, token: string, label = 'QA SnapTrade'): Promise<APIResponse> =>
  api.post(`${P}/snaptrade/start`, { token, data: { label } });
export const snaptradeFinish = (api: SafeApi, token: string, label = 'QA SnapTrade'): Promise<APIResponse> =>
  api.post(`${P}/snaptrade/finish`, { token, data: { label } });
/** Unauthenticated webhook — no token by design. */
export const snaptradeWebhook = (api: SafeApi, body: Record<string, unknown>): Promise<APIResponse> =>
  api.post(`${P}/snaptrade/webhook`, { data: body });
