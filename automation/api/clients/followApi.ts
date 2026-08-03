/** Follow-requests API — /api/follow-requests/*. Create=require_subscriber; approve/reject=require_trader. */
import type { APIResponse } from '@playwright/test';
import type { SafeApi } from '../../common/api.js';

const P = '/api/follow-requests';

export const createRequest = (api: SafeApi, subToken: string, traderId: string): Promise<APIResponse> =>
  api.post(P, { token: subToken, data: { trader_id: traderId } });
export const approve = (api: SafeApi, traderToken: string, requestId: string): Promise<APIResponse> =>
  api.post(`${P}/${requestId}/approve`, { token: traderToken });
export const reject = (api: SafeApi, traderToken: string, requestId: string): Promise<APIResponse> =>
  api.post(`${P}/${requestId}/reject`, { token: traderToken });
export const mine = (api: SafeApi, subToken: string): Promise<APIResponse> => api.get(`${P}/mine`, { token: subToken });
export const incoming = (api: SafeApi, traderToken: string, status = 'pending'): Promise<APIResponse> =>
  api.get(`${P}/incoming`, { token: traderToken, params: { status } });
