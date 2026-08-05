/** Notifications API — /api/notifications/*. All routes are current_user + self-scoped. */
import type { APIResponse } from '@playwright/test';
import type { SafeApi } from '../../common/api.js';

const P = '/api/notifications';

export const list = (
  api: SafeApi,
  token: string,
  q: { limit?: number; unread_only?: boolean } = {},
): Promise<APIResponse> => api.get(P, { token, params: q as Record<string, string | number | boolean> });
export const unreadCount = (api: SafeApi, token: string): Promise<APIResponse> =>
  api.get(`${P}/unread-count`, { token });
export const markRead = (api: SafeApi, token: string, id: string): Promise<APIResponse> =>
  api.post(`${P}/${id}/read`, { token });
export const markAllRead = (api: SafeApi, token: string): Promise<APIResponse> => api.post(`${P}/read-all`, { token });
