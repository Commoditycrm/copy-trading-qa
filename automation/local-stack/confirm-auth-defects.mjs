// Deterministic double-reproduction of the three Known/Potential Auth findings, with env/test-data
// controls, per DEFECT_MANAGEMENT_PROCESS §7. Prints a JSON verdict. Run against the local QA stack.
import http from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import jwt from 'jsonwebtoken';

const here = dirname(fileURLToPath(import.meta.url));
const compose = resolve(here, 'docker-compose.qa.yml');
const SECRET = readFileSync(resolve(here, '../.env'), 'utf8').match(/^JWT_SECRET=(.*)$/m)[1];
const BASE = 'http://localhost:8000';
let ipSeq = 0;
const ip = () => `10.90.${(ipSeq += 1)}.${Math.floor(Math.random() * 254) + 1}`;

function post(path, body, headers = {}) {
  return new Promise((res) => {
    const data = JSON.stringify(body);
    const req = http.request(
      BASE + path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      },
      (r) => {
        let b = '';
        r.on('data', (c) => (b += c));
        r.on('end', () => res({ status: r.statusCode, body: b }));
      },
    );
    req.on('error', () => res({ status: 0, body: '' }));
    req.write(data);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function resetTokenFor(userId) {
  const logs = execSync(`docker compose -f "${compose}" logs backend --since 120s --no-color`, { encoding: 'utf8' });
  const re = /token=([A-Za-z0-9._-]{20,})/g;
  let m,
    found = null;
  while ((m = re.exec(logs))) {
    try {
      if (jwt.decode(m[1])?.sub === userId) found = m[1];
    } catch {}
  }
  return found;
}

const out = { defectA_refresh500: [], defectB_resetWeaker: [], defectC_emailCase: [], controls: {} };

// ── Control: registration REJECTS the weak password (rules out "weak pw is globally allowed") ──
out.controls.register_weak_pw = (
  await post(
    '/api/auth/register',
    { email: `qa+ctl-${Date.now()}@qa.kopyya.dev`, password: 'abcdefgh', role: 'subscriber' },
    { 'X-Forwarded-For': ip() },
  )
).status;

// ── Defect A: malformed refresh sub → expect 401, observe status (twice) ──
for (let i = 0; i < 2; i += 1) {
  const forged = jwt.sign({ sub: 'not-a-uuid', type: 'refresh' }, SECRET, { algorithm: 'HS256', expiresIn: 1800 });
  out.defectA_refresh500.push((await post('/api/auth/refresh', { refresh_token: forged })).status);
}

// ── Defect B: reset accepts the weak password registration rejects (twice) ──
for (let i = 0; i < 2; i += 1) {
  const email = `qa+defB-${Date.now()}-${i}@qa.kopyya.dev`;
  const xff = { 'X-Forwarded-For': ip() };
  const reg = await post('/api/auth/register', { email, password: 'Qa!Strong123', role: 'subscriber' }, xff);
  const id = JSON.parse(reg.body).id;
  await post('/api/auth/forgot-password', { email }, xff);
  let tok = null;
  for (let t = 0; t < 8 && !tok; t += 1) {
    await sleep(1000);
    tok = resetTokenFor(id);
  }
  const r = await post('/api/auth/reset-password', { token: tok, new_password: 'abcdefgh' });
  out.defectB_resetWeaker.push({ resetStatus: r.status, gotToken: !!tok });
}

// ── Defect C: mixed-case forgot produces NO reset token; lowercase control DOES (twice) ──
for (let i = 0; i < 2; i += 1) {
  const email = `qa+defC-${Date.now()}-${i}@qa.kopyya.dev`;
  const xff = { 'X-Forwarded-For': ip() };
  const reg = await post('/api/auth/register', { email, password: 'Qa!Strong123', role: 'subscriber' }, xff);
  const id = JSON.parse(reg.body).id;
  await post('/api/auth/forgot-password', { email: email.toUpperCase() }, xff); // mixed/upper case
  await sleep(4000);
  const upperTok = resetTokenFor(id);
  await post('/api/auth/forgot-password', { email }, xff); // lowercase control
  let lowerTok = null;
  for (let t = 0; t < 6 && !lowerTok; t += 1) {
    await sleep(1000);
    lowerTok = resetTokenFor(id);
  }
  out.defectC_emailCase.push({ upperCaseProducedToken: !!upperTok, lowerCaseProducedToken: !!lowerTok });
}

console.log(JSON.stringify(out, null, 2));
