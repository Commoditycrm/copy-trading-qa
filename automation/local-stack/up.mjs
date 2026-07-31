// local:up — ensure QA-only secrets exist, sync the JWT secret into the test env, then bring the
// disposable local stack up. Localhost only, fake broker, no production credentials.
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const automationDir = resolve(here, '..');
const qaEnvPath = resolve(here, 'qa.env');
const examplePath = resolve(here, 'qa.env.example');
const testEnvPath = resolve(automationDir, '.env');
const full = process.argv.includes('--full');

function fernetKey() {
  // 32 random bytes, url-safe base64 WITH padding (valid Fernet key).
  return randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

// 1) Generate qa.env (QA-only secrets) if missing.
let jwtSecret;
if (!existsSync(qaEnvPath)) {
  jwtSecret = 'qa-' + randomBytes(24).toString('hex');
  const env = readFileSync(examplePath, 'utf8')
    .replace('__GENERATED_QA_ONLY__', jwtSecret)
    .replace('__GENERATED_QA_FERNET_KEY__', fernetKey());
  writeFileSync(qaEnvPath, env);
  console.log('[local:up] generated qa.env with fresh QA-only secrets');
} else {
  jwtSecret = readFileSync(qaEnvPath, 'utf8').match(/^JWT_SECRET=(.*)$/m)?.[1] ?? '';
  console.log('[local:up] reusing existing qa.env');
}

// 2) Sync JWT_SECRET + targets into automation/.env so tests mint tokens with the SAME secret.
const testEnv = [
  'QA_ENV=local',
  'QA_BASE_URL=http://localhost:8000',
  'QA_FRONTEND_URL=http://localhost:3000',
  'BROKER_MODE=fake',
  `JWT_SECRET=${jwtSecret}`,
  '',
].join('\n');
writeFileSync(testEnvPath, testEnv);
console.log('[local:up] wrote automation/.env (JWT secret synced to backend)');

// 3) Compose up (core services by default; +frontend with --full).
const services = full ? '' : 'db redis backend worker';
const cmd = `docker compose -f "${resolve(here, 'docker-compose.qa.yml')}" ${full ? '--profile full ' : ''}up -d --build ${services}`;
console.log('[local:up] ' + cmd);
execSync(cmd, { stdio: 'inherit' });
console.log('[local:up] stack starting — run `npm run local:health` to wait for readiness.');
