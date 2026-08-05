/** Positions / Options / History / Calendar / Export clients. All current_user; mutations via SafeApi. */
import type { APIResponse } from '@playwright/test';
import type { SafeApi } from '../../common/api.js';

// ── Positions ──
export const listPositions = (api: SafeApi, token: string): Promise<APIResponse> =>
  api.get('/api/positions', { token });
export const closePosition = (
  api: SafeApi,
  token: string,
  brokerSymbol: string,
  brokerAccountId: string,
  body: Record<string, unknown> = {},
): Promise<APIResponse> =>
  api.post(`/api/positions/${encodeURIComponent(brokerSymbol)}/close?broker_account_id=${brokerAccountId}`, {
    token,
    data: body,
  });
export const closeAll = (api: SafeApi, token: string, includeSubscribers = false): Promise<APIResponse> =>
  api.post(`/api/positions/close-all?include_subscribers=${includeSubscribers}`, { token });
export const closeAllSubscribers = (api: SafeApi, traderToken: string): Promise<APIResponse> =>
  api.post('/api/positions/close-all-subscribers', { token: traderToken });

// ── Options ──
export const optExpiries = (api: SafeApi, token: string, accountId: string, symbol: string): Promise<APIResponse> =>
  api.get('/api/options/expiries', { token, params: { account_id: accountId, symbol } });
export const optStrikes = (
  api: SafeApi,
  token: string,
  accountId: string,
  symbol: string,
  expiry: string,
  right = 'call',
): Promise<APIResponse> =>
  api.get('/api/options/strikes', { token, params: { account_id: accountId, symbol, expiry, right } });
export const optQuote = (
  api: SafeApi,
  token: string,
  accountId: string,
  symbol: string,
  expiry: string,
  strike: number,
  right = 'call',
  debug = 0,
): Promise<APIResponse> =>
  api.get('/api/options/quote', { token, params: { account_id: accountId, symbol, expiry, strike, right, debug } });

// ── Trade history ──
export const trades = (
  api: SafeApi,
  token: string,
  params: Record<string, string | number> = {},
): Promise<APIResponse> => api.get('/api/trades', { token, params });
export const tradesPage = (
  api: SafeApi,
  token: string,
  params: Record<string, string | number> = {},
): Promise<APIResponse> => api.get('/api/trades/page', { token, params });
export const tradesStats = (
  api: SafeApi,
  token: string,
  params: Record<string, string | number> = {},
): Promise<APIResponse> => api.get('/api/trades/stats', { token, params });
export const getTrade = (api: SafeApi, token: string, orderId: string): Promise<APIResponse> =>
  api.get(`/api/trades/${orderId}`, { token });
export const exportTrades = (
  api: SafeApi,
  token: string,
  params: Record<string, string | number> = {},
): Promise<APIResponse> => api.get('/api/trades/export', { token, params });
export const exportCount = (
  api: SafeApi,
  token: string,
  params: Record<string, string | number> = {},
): Promise<APIResponse> => api.get('/api/trades/export/count', { token, params });

// ── Calendar / P&L ──
export const calendarPnl = (
  api: SafeApi,
  token: string,
  from: string,
  to: string,
  extra: Record<string, string> = {},
): Promise<APIResponse> => api.get('/api/calendar/pnl', { token, params: { from, to, ...extra } });
