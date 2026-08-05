/**
 * k6 — Authentication load. Login + refresh throughput/latency. A per-iteration X-Forwarded-For isolates the
 * per-IP throttle so this measures raw throughput; the rate-limit behaviour is exercised separately.
 * Tunables: VUS, DUR, P95 (threshold ms). Target http://backend:8000 on the compose network.
 * SAFETY: fake broker / synthetic @qa.kopyya.dev users / local-qa only.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://backend:8000';
const loginDur = new Trend('login_duration', true);
const refreshDur = new Trend('refresh_duration', true);
const loginFail = new Rate('login_failed');

export const options = {
  scenarios: {
    load: { executor: 'constant-vus', vus: Number(__ENV.VUS || 5), duration: __ENV.DUR || '20s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    login_duration: [`p(95)<${__ENV.P95 || 800}`],
    login_failed: ['rate<0.05'],
  },
};

const H = (ip) => ({ headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip } });

export function setup() {
  const email = `qa+perflogin-${Date.now()}@qa.kopyya.dev`;
  const password = 'PerfLoad!2026x';
  const r = http.post(
    `${BASE}/api/auth/register`,
    JSON.stringify({ email, password, role: 'subscriber', display_name: 'perf' }),
    H('10.9.0.1'),
  );
  check(r, { 'setup register 2xx': (x) => x.status < 300 });
  return { email, password };
}

export default function (data) {
  const ip = `10.${(__VU % 250) + 1}.${(__ITER % 250) + 1}.7`;
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: data.email, password: data.password }), H(ip));
  loginDur.add(r.timings.duration);
  const ok = check(r, { 'login 200': (x) => x.status === 200, 'has token': (x) => !!x.json('access_token') });
  loginFail.add(!ok);
  if (ok) {
    const rt = r.json('refresh_token');
    const rr = http.post(`${BASE}/api/auth/refresh`, JSON.stringify({ refresh_token: rt }), H(ip));
    refreshDur.add(rr.timings.duration);
    check(rr, { 'refresh 200': (x) => x.status === 200 });
  }
}
