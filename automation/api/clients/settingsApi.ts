/**
 * Subscriber settings API client — /api/settings/subscriber/*. Every endpoint is require_subscriber
 * and self-scoped (keyed on the authenticated user; no path/body user id). All mutations go through SafeApi.
 */
import type { APIResponse } from '@playwright/test';
import type { SafeApi } from '../../common/api.js';

const P = '/api/settings/subscriber';
const patch = (api: SafeApi, token: string, path: string, data: unknown) => api.patch(`${P}${path}`, { token, data });

export const get = (api: SafeApi, token: string): Promise<APIResponse> => api.get(P, { token });
export const reset = (api: SafeApi, token: string): Promise<APIResponse> => api.post(`${P}/reset`, { token });

export const dailyLoss = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/daily-loss-limit', { daily_loss_limit: v });
export const dailyProfit = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/daily-profit-limit', { daily_profit_limit: v });
export const dailyLossPct = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/daily-loss-limit-pct', { daily_loss_limit_pct: v });
export const dailyProfitPct = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/daily-profit-limit-pct', { daily_profit_limit_pct: v });
export const maxAccountPct = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/max-account-pct', { max_account_pct_per_day: v });
export const autoLiquidation = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/auto-liquidation-limit', { auto_liquidation_limit: v });
export const maxPerContract = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/max-per-contract', { max_per_contract: v });
export const positionTp = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/position-tp-pct', { position_tp_pct: v });
export const positionSl = (api: SafeApi, t: string, v: number | null) =>
  patch(api, t, '/position-sl-pct', { position_sl_pct: v });
export const copyTraderBracket = (api: SafeApi, t: string, v: boolean) =>
  patch(api, t, '/copy-trader-bracket', { copy_trader_bracket: v });
export const eodAutoclose = (api: SafeApi, t: string, enabled: boolean | null, minutes: number | null) =>
  patch(api, t, '/eod-autoclose', { enabled, minutes });
export const retryInterval = (api: SafeApi, t: string, open: string | null, close: string | null, max: number | null) =>
  patch(api, t, '/retry-interval', { retry_interval_open: open, retry_interval_close: close, retry_max_attempts: max });
export const symbolFilter = (api: SafeApi, t: string, excl: string[] | null, incl: string[] | null) =>
  patch(api, t, '/symbol-filter', { symbol_exclusion_list: excl, symbol_inclusion_list: incl });
export const copy = (api: SafeApi, t: string, v: boolean) => patch(api, t, '/copy', { copy_enabled: v });
export const multiplier = (api: SafeApi, t: string, v: number) => patch(api, t, '/multiplier', { multiplier: v });
export const follow = (api: SafeApi, t: string, trader_id: string | null) => patch(api, t, '/follow', { trader_id });
