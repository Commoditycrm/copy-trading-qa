/**
 * LOCAL-ONLY Redis helpers for rate-limit key isolation. Uses `docker compose exec redis redis-cli`
 * against the disposable local stack. Refuses to run outside env=local. Only touches `rl:*` keys so it
 * never disturbs application state beyond rate-limit counters.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { QaConfig } from './config.js';

const here = dirname(fileURLToPath(import.meta.url));
const compose = resolve(here, '../local-stack/docker-compose.qa.yml');

function cli(args: string): string {
  return execSync(`docker compose -f "${compose}" exec -T redis redis-cli -a qaredispass ${args}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function assertLocal(cfg: QaConfig, key: string): void {
  if (cfg.envName !== 'local') throw new Error(`[SAFETY] localRedis refuses to run in env=${cfg.envName} (local only)`);
  if (!key.startsWith('rl:')) throw new Error(`[SAFETY] localRedis only touches rate-limit keys (rl:*), got ${key}`);
}

/** Delete a rate-limit key (isolate/reset before and after a rate-limit test). */
export function delRateLimitKey(cfg: QaConfig, key: string): void {
  assertLocal(cfg, key);
  cli(`DEL "${key}"`);
}
/** Read a rate-limit counter (for assertions). */
export function getRateLimitKey(cfg: QaConfig, key: string): string {
  assertLocal(cfg, key);
  return cli(`GET "${key}"`);
}
