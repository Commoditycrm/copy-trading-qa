/**
 * k6 — authenticated read-endpoint latency (data views). Cycles GET /api/auth/me, /api/notifications,
 * /api/trades for a pre-issued bearer token (TOKEN env). Measures per-endpoint p50/p95/p99 under load.
 * SAFETY: read-only GETs, synthetic user, local-qa only.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://backend:8000';
const TOKEN = __ENV.TOKEN;
const me = new Trend('r_me', true);
const notif = new Trend('r_notifications', true);
const trades = new Trend('r_trades', true);

export const options = {
  scenarios: { load: { executor: 'constant-vus', vus: Number(__ENV.VUS || 10), duration: __ENV.DUR || '20s' } },
  thresholds: { http_req_failed: ['rate<0.02'], r_notifications: ['p(95)<300'] },
};

const H = { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } };

export default function () {
  const a = http.get(`${BASE}/api/auth/me`, H);
  me.add(a.timings.duration);
  check(a, { 'me 200': (x) => x.status === 200 });
  const b = http.get(`${BASE}/api/notifications?limit=20`, H);
  notif.add(b.timings.duration);
  check(b, { 'notif 200': (x) => x.status === 200 });
  const c = http.get(`${BASE}/api/trades?limit=20`, H);
  trades.add(c.timings.duration);
  check(c, { 'trades 2xx': (x) => x.status < 300 });
}
