/** Admin API client — /api/admin/*. Every route is require_admin. */
import type { APIResponse } from '@playwright/test';
import type { SafeApi } from '../../common/api.js';

const P = '/api/admin';

// dashboards / lists
export const stats = (api: SafeApi, t: string): Promise<APIResponse> => api.get(`${P}/stats`, { token: t });
export const users = (api: SafeApi, t: string, params: Record<string, string | number> = {}): Promise<APIResponse> =>
  api.get(`${P}/users`, { token: t, params });
export const userCounts = (api: SafeApi, t: string): Promise<APIResponse> => api.get(`${P}/users/counts`, { token: t });
export const dailyPnl = (api: SafeApi, t: string, from: string, to: string, extra: Record<string, string> = {}): Promise<APIResponse> =>
  api.get(`${P}/daily-pnl`, { token: t, params: { from, to, ...extra } });
export const rejectedOrders = (api: SafeApi, t: string, params: Record<string, string | number> = {}): Promise<APIResponse> =>
  api.get(`${P}/rejected-orders`, { token: t, params });
export const brokerHealth = (api: SafeApi, t: string): Promise<APIResponse> => api.get(`${P}/broker-health`, { token: t });
export const listenerHealth = (api: SafeApi, t: string): Promise<APIResponse> => api.get(`${P}/listener-health`, { token: t });
export const performanceFanouts = (api: SafeApi, t: string, params: Record<string, string | number> = {}): Promise<APIResponse> =>
  api.get(`${P}/performance/fanouts`, { token: t, params });
export const performanceExport = (api: SafeApi, t: string, params: Record<string, string | number> = {}): Promise<APIResponse> =>
  api.get(`${P}/performance/export`, { token: t, params });

// user mutations
export const activate = (api: SafeApi, t: string, id: string): Promise<APIResponse> => api.patch(`${P}/users/${id}/activate`, { token: t });
export const deactivate = (api: SafeApi, t: string, id: string): Promise<APIResponse> => api.patch(`${P}/users/${id}/deactivate`, { token: t });
export const changeRole = (api: SafeApi, t: string, id: string, role: string): Promise<APIResponse> => api.patch(`${P}/users/${id}/role`, { token: t, data: { role } });
export const changeBusinessName = (api: SafeApi, t: string, id: string, business_name: string): Promise<APIResponse> => api.patch(`${P}/users/${id}/business-name`, { token: t, data: { business_name } });

// load-test
export const loadTestSeed = (api: SafeApi, t: string, body: Record<string, unknown>): Promise<APIResponse> => api.post(`${P}/load-test/seed`, { token: t, data: body });
export const loadTestCleanup = (api: SafeApi, t: string, body: Record<string, unknown> = {}): Promise<APIResponse> => api.post(`${P}/load-test/cleanup`, { token: t, data: body });
export const loadTestCount = (api: SafeApi, t: string): Promise<APIResponse> => api.get(`${P}/load-test/count`, { token: t });

// runtime config (Redis-backed)
export const getFanoutThreshold = (api: SafeApi, t: string): Promise<APIResponse> => api.get(`${P}/config/fanout-batch-threshold`, { token: t });
export const setFanoutThreshold = (api: SafeApi, t: string, threshold: number | null): Promise<APIResponse> => api.patch(`${P}/config/fanout-batch-threshold`, { token: t, data: { threshold } });
export const getAlpacaInterval = (api: SafeApi, t: string): Promise<APIResponse> => api.get(`${P}/config/alpaca-pnl-poll-interval`, { token: t });
export const setAlpacaInterval = (api: SafeApi, t: string, interval_s: number | null): Promise<APIResponse> => api.patch(`${P}/config/alpaca-pnl-poll-interval`, { token: t, data: { interval_s } });

// sms + reconcile
export const smsTest = (api: SafeApi, t: string, to: string): Promise<APIResponse> => api.post(`${P}/sms/test`, { token: t, data: { to } });
export const reconcile = (api: SafeApi, t: string, params: Record<string, string | number | boolean> = {}): Promise<APIResponse> =>
  api.post(`${P}/positions/reconcile`, { token: t, params });
