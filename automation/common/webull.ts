/**
 * LOCAL-ONLY grey-box helpers for the direct-Webull integration (app/brokers/webull.py +
 * services/webull_listener.py). These drive `docker compose exec` against the disposable QA backend/db to
 * assert supply-chain + safety properties that can't be observed over the API — the compromised unofficial
 * `webull` package must stay gone (May-2026 incident), the official SDK must import LAZILY (never at boot),
 * and the feature must default off/shadow. Read-only against the app; never touches production.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { QaConfig } from './config.js';

const compose = resolve(dirname(fileURLToPath(import.meta.url)), '../local-stack/docker-compose.qa.yml');

function assertLocal(cfg: QaConfig): void {
  if (cfg.envName !== 'local')
    throw new Error(`[SAFETY] webull grey-box refuses to run in env=${cfg.envName} (local only)`);
}

/** Run an arbitrary shell command inside the backend container (base64-wrapped to avoid quoting issues). */
export function backendSh(cmd: string): string {
  const b64 = Buffer.from(cmd, 'utf8').toString('base64');
  return execSync(`docker compose -f "${compose}" exec -T backend sh -c "echo ${b64} | base64 -d | sh"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** Run a Python snippet inside the backend (it should `print(...)` its result). */
export function backendPy(code: string): string {
  const b64 = Buffer.from(code, 'utf8').toString('base64');
  return backendSh(`python -c "import base64;exec(base64.b64decode('${b64}').decode())"`);
}

/** Query the disposable Postgres. */
function db(sql: string): string {
  return execSync(
    `docker compose -f "${compose}" exec -T db psql -U qa -d copytrading_qa -tAc "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

/** Whether the app under test actually has the direct-Webull feature (the `broker_name` enum carries
 *  'webull'). False on the pre-feature baseline (d8724f5) → the webull specs skip there. */
export function webullFeaturePresent(cfg: QaConfig): boolean {
  assertLocal(cfg);
  try {
    return db("SELECT 'webull' = ANY(enum_range(NULL::broker_name)::text[])") === 't';
  } catch {
    return false;
  }
}

/** `broker_name` enum labels. */
export function brokerEnumLabels(cfg: QaConfig): string[] {
  assertLocal(cfg);
  const out = db("SELECT array_to_string(enum_range(NULL::broker_name), ',')");
  return out === '' ? [] : out.split(',');
}

/** pip metadata for a distribution (empty string if not installed). */
export function pipShow(cfg: QaConfig, dist: string): string {
  assertLocal(cfg);
  return backendSh(`pip show ${dist} 2>/dev/null || true`);
}

/** True if importing the webull ADAPTER pulls the webull SDK into sys.modules (i.e. NOT a lazy import). */
export function webullSdkImportedByAdapter(cfg: QaConfig): boolean {
  assertLocal(cfg);
  const out = backendPy(
    'import app.brokers.webull, sys;' +
      "print('LEAK' if any(m == 'webull' or m.startswith('webull.') for m in sys.modules) else 'LAZY')",
  );
  return out.includes('LEAK');
}

/** Effective safety flags from the running backend's settings. */
export function webullFlags(cfg: QaConfig): { enabled: boolean; shadow: boolean } {
  assertLocal(cfg);
  const out = backendPy(
    'from app.config import get_settings as g; s=g();' +
      "print(f'{s.webull_direct_enabled}|{s.webull_direct_shadow_mode}')",
  );
  const [enabled, shadow] = out.split('|');
  return { enabled: enabled === 'True', shadow: shadow === 'True' };
}
