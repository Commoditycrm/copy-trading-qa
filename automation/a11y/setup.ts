/** Shared a11y setup — worker-scope-safe session creation via a raw request context (no test fixtures). */
import { request as pwRequest } from '@playwright/test';
import { makeUser } from '../common/factory.js';
import { registerAndLogin } from '../api/clients/authApi.js';
import { promoteToAdmin } from '../common/localAdmin.js';
import { mintAccess } from '../common/jwt.js';
import { loadConfig } from '../common/config.js';
import { SafeApi } from '../common/api.js';

export type Sess = { email: string; id: string; tokens: { access: string; refresh: string } };

export async function makeSession(role: 'trader' | 'subscriber', admin = false): Promise<Sess> {
  const config = loadConfig();
  const ctx = await pwRequest.newContext({ baseURL: config.apiBaseUrl });
  try {
    const api = new SafeApi(ctx, config);
    const u = makeUser(role);
    const acct = await registerAndLogin(api, u);
    let tokens = { access: acct.access, refresh: acct.refresh };
    if (admin) {
      promoteToAdmin(config, u.email);
      tokens = { access: mintAccess(config, acct.id, 'admin'), refresh: acct.refresh };
    }
    return { email: u.email, id: acct.id, tokens };
  } finally {
    await ctx.dispose();
  }
}
