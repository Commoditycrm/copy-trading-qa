// local:health — poll the backend /api/health until ready (or timeout). Exit 0 healthy, 1 otherwise.
import http from 'node:http';

const url = 'http://localhost:8000/api/health';
const deadline = Date.now() + 120_000; // 2 min

function ping() {
  return new Promise((res) => {
    const req = http.get(url, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => res({ ok: r.statusCode === 200, body }));
    });
    req.on('error', () => res({ ok: false }));
    req.setTimeout(3000, () => { req.destroy(); res({ ok: false }); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

while (Date.now() < deadline) {
  const { ok, body } = await ping();
  if (ok) {
    console.log('[local:health] backend healthy:', (body || '').slice(0, 80));
    process.exit(0);
  }
  process.stdout.write('.');
  await sleep(3000);
}
console.error('\n[local:health] backend did not become healthy within timeout');
process.exit(1);
