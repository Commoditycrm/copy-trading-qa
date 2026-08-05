/**
 * Auth API client — thin wrappers over SafeApi for the /api/auth/* surface. Mutating calls go through
 * SafeApi (production write-block + redacted evidence). A per-user X-Forwarded-For isolates the per-IP
 * register/login throttles so tests don't bleed rate-limit state into each other.
 */
import type { APIResponse } from '@playwright/test';
import type { SafeApi } from '../../common/api.js';
import type { NewUser } from '../../common/factory.js';

const xff = (ip?: string): Record<string, string> => (ip ? { 'X-Forwarded-For': ip } : {});

/** POST /register with an arbitrary body (used for the admin-block case). */
export const registerRaw = (api: SafeApi, body: Record<string, unknown>, clientIp?: string): Promise<APIResponse> =>
  api.post('/api/auth/register', { data: body, headers: xff(clientIp) });

export const register = (api: SafeApi, u: NewUser): Promise<APIResponse> => {
  const { clientIp, ...body } = u; // clientIp travels in the header, not the body
  return registerRaw(api, body, clientIp);
};

export const login = (api: SafeApi, email: string, password: string, clientIp?: string): Promise<APIResponse> =>
  api.post('/api/auth/login', { data: { email, password }, headers: xff(clientIp) });

export const refresh = (api: SafeApi, refresh_token: string): Promise<APIResponse> =>
  api.post('/api/auth/refresh', { data: { refresh_token } });

export const me = (api: SafeApi, token: string): Promise<APIResponse> => api.get('/api/auth/me', { token });

/** PATCH /api/auth/me — self-scoped profile update (phone + SMS consent/category flags). */
export const updateMe = (api: SafeApi, token: string, body: Record<string, unknown>): Promise<APIResponse> =>
  api.patch('/api/auth/me', { token, data: body });

export const forgotPassword = (api: SafeApi, email: string, clientIp?: string): Promise<APIResponse> =>
  api.post('/api/auth/forgot-password', { data: { email }, headers: xff(clientIp) });

export const resetPassword = (api: SafeApi, token: string, new_password: string): Promise<APIResponse> =>
  api.post('/api/auth/reset-password', { data: { token, new_password } });

export const verifyEmail = (api: SafeApi, token: string): Promise<APIResponse> =>
  api.post('/api/auth/verify-email', { data: { token } });

export const changeEmail = (
  api: SafeApi,
  accessToken: string,
  new_email: string,
  password: string,
): Promise<APIResponse> => api.post('/api/auth/change-email', { token: accessToken, data: { new_email, password } });

export const verifyEmailChange = (api: SafeApi, token: string): Promise<APIResponse> =>
  api.post('/api/auth/verify-email-change', { data: { token } });

/** Register + login using the user's synthetic client IP; returns tokens + the created user id. */
export async function registerAndLogin(
  api: SafeApi,
  u: NewUser,
): Promise<{ access: string; refresh: string; id: string }> {
  const r = await register(api, u);
  if (r.status() !== 201) throw new Error(`register failed ${r.status()}: ${await r.text()}`);
  const id = (await r.json()).id;
  const l = await login(api, u.email, u.password, u.clientIp);
  if (l.status() !== 200) throw new Error(`login failed ${l.status()}: ${await l.text()}`);
  const body = await l.json();
  return { access: body.access_token, refresh: body.refresh_token, id };
}
