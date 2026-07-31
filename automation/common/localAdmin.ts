/**
 * LOCAL-ONLY admin helpers. Operate directly on the disposable local QA Postgres via `docker compose
 * exec` — scoped strictly to a single namespaced test-user email. Refuses to run outside env=local.
 * Never touches production or non-synthetic data.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { QaConfig } from './config.js';

const here = dirname(fileURLToPath(import.meta.url));
const compose = resolve(here, '../local-stack/docker-compose.qa.yml');

function assertLocal(cfg: QaConfig): void {
  if (cfg.envName !== 'local') throw new Error(`[SAFETY] localAdmin refuses to run in env=${cfg.envName} (local only)`);
}
function assertSynthetic(email: string): void {
  if (!email.endsWith('@qa.kopyya.dev')) throw new Error(`[SAFETY] localAdmin only operates on @qa.kopyya.dev test users (got ${email})`);
}
function psql(sql: string): string {
  return execSync(`docker compose -f "${compose}" exec -T db psql -U qa -d copytrading_qa -tAc "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** Deactivate (is_active=false) exactly one namespaced test user. */
export function deactivateUser(cfg: QaConfig, email: string): void {
  assertLocal(cfg); assertSynthetic(email);
  psql(`UPDATE users SET is_active=false WHERE email='${email}'`);
}
/** Reactivate a namespaced test user (cleanup/restore). */
export function reactivateUser(cfg: QaConfig, email: string): void {
  assertLocal(cfg); assertSynthetic(email);
  psql(`UPDATE users SET is_active=true WHERE email='${email}'`);
}
/** Hard-delete a namespaced test user (cascade) — cleanup. */
export function deleteUser(cfg: QaConfig, email: string): void {
  assertLocal(cfg); assertSynthetic(email);
  psql(`DELETE FROM users WHERE email='${email}'`);
}
/** Read is_active for assertions. */
export function isActive(cfg: QaConfig, email: string): boolean {
  assertLocal(cfg); assertSynthetic(email);
  return psql(`SELECT is_active FROM users WHERE email='${email}'`) === 't';
}
