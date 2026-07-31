/**
 * Control client for the QA mock brokerage (automation/mock-broker/). LOCAL-QA ONLY.
 *  - Scenario + history calls go over HTTP to the mock service (127.0.0.1:9099).
 *  - Grey-box calls (drive the app's OWN fills-sync / listener / bracket / retry logic with the
 *    controllable adapter) run in-container via automation/mock-broker/driver.py.
 * All state is namespaced by the test RUN_ID and reset between tests.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { QaConfig } from './config.js';
import { RUN_ID } from './factory.js';

const here = dirname(fileURLToPath(import.meta.url));
const compose = resolve(here, '../local-stack/docker-compose.qa.yml');
const driver = resolve(here, '../mock-broker/driver.py');
const ADMIN = process.env.MOCK_BROKER_ADMIN_URL || 'http://127.0.0.1:9099';

function assertLocal(cfg: QaConfig): void {
  if (cfg.envName !== 'local') throw new Error(`[SAFETY] mockBrokerClient refuses env=${cfg.envName} (local only)`);
}

async function admin(method: 'POST' | 'GET', path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${ADMIN}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`mock-broker ${method} ${path} -> ${res.status}`);
  return res.json();
}

export type PlaceMode = 'success' | 'reject' | 'transient' | 'permanent' | 'timeout' | 'ratelimit' | 'conflict';
export type CancelMode = 'success' | 'already_terminal' | 'fail';
export interface MockPosition {
  symbol: string;
  quantity: number | string; // signed: + long, − short
  instrument_type?: 'stock' | 'option';
  avg_entry_price?: number | string;
  option_strike?: number | string;
  option_right?: 'call' | 'put';
}

export interface CallRecord {
  ts: string;
  method: 'place' | 'get_order' | 'cancel' | 'get_positions';
  account_id: string | null;
  broker_order_id: string | null;
  client_order_id?: string | null;
  outcome: string;
}

export class MockBroker {
  constructor(private readonly cfg: QaConfig, private readonly runId: string = RUN_ID) {
    assertLocal(cfg);
  }

  /** rule 5 — clear all scenario + history for this run. */
  resetScenario(): Promise<any> {
    return admin('POST', '/admin/reset', { run_id: this.runId });
  }

  setPlaceOrderResult(accountId: string, mode: PlaceMode, opts: { reason?: string; fill?: object } = {}): Promise<any> {
    return admin('POST', '/admin/place-result', { run_id: this.runId, account_id: accountId, mode, ...opts });
  }
  setOrderStatus(orderId: string, status: string, filled_quantity?: number | string, filled_avg_price?: number | string): Promise<any> {
    return admin('POST', '/admin/order-status', { run_id: this.runId, order_id: orderId, status, filled_quantity, filled_avg_price });
  }
  setFill(orderId: string, filled_quantity: number | string, filled_avg_price: number | string, status?: 'filled' | 'partially_filled'): Promise<any> {
    return admin('POST', '/admin/fill', { run_id: this.runId, order_id: orderId, filled_quantity, filled_avg_price, status });
  }
  setPosition(accountId: string, positions: MockPosition[]): Promise<any> {
    return admin('POST', '/admin/position', { run_id: this.runId, account_id: accountId, positions });
  }
  setCancelResult(orderId: string, mode: CancelMode): Promise<any> {
    return admin('POST', '/admin/cancel-result', { run_id: this.runId, order_id: orderId, mode });
  }
  setLatency(accountId: string | null, ms: number): Promise<any> {
    return admin('POST', '/admin/latency', { run_id: this.runId, account_id: accountId, ms });
  }
  setRateLimit(accountId: string): Promise<any> {
    return admin('POST', '/admin/rate-limit', { run_id: this.runId, account_id: accountId });
  }

  async getCallHistory(accountId?: string): Promise<CallRecord[]> {
    const q = `?run_id=${encodeURIComponent(this.runId)}${accountId ? `&account_id=${accountId}` : ''}`;
    return (await admin('GET', `/admin/call-history${q}`)).calls;
  }
  async getOrderHistory(accountId?: string): Promise<any[]> {
    const q = `?run_id=${encodeURIComponent(this.runId)}${accountId ? `&account_id=${accountId}` : ''}`;
    return (await admin('GET', `/admin/order-history${q}`)).orders;
  }
  /** count broker calls of a given method (optionally on one account). */
  async callCount(method: CallRecord['method'], accountId?: string): Promise<number> {
    return (await this.getCallHistory(accountId)).filter((c) => c.method === method).length;
  }

  // ── grey-box: drive the app's real logic with the controllable adapter ──
  private drive(action: string, args: object): any {
    const spec = Buffer.from(JSON.stringify({ action, run_id: this.runId, ...args })).toString('base64');
    execSync(`docker compose -f "${compose}" cp "${driver}" backend:/tmp/qa_driver.py`, { stdio: ['ignore', 'ignore', 'pipe'] });
    const out = execSync(
      `docker compose -f "${compose}" exec -T -e PYTHONPATH=/app -e DRIVER_SPEC_B64=${spec} backend python /tmp/qa_driver.py`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    const line = out.split('\n').filter(Boolean).pop() || '{}';
    return JSON.parse(line);
  }

  /** Run the app's fills-sync poll for an account (get_order → DB), so configured fills land. */
  syncFills(accountId: string): any {
    return this.drive('refresh_fills', { account_id: accountId });
  }
  /** Run the app's retry scheduler over one order (re-place a RETRY_PENDING child). */
  runRetry(orderId: string): any {
    return this.drive('run_retry', { order_id: orderId });
  }
  /** Emit a broker order/fill event into the app's real listener handler (echo/duplicate/replay). */
  emitBrokerEvent(args: { trader_id: string; account_id: string; order_id?: string; client_order_id?: string; broker_order_id?: string; event?: string; status?: string; submitted_at?: string; symbol?: string; side?: string; quantity?: number | string }): any {
    return this.drive('emit_event', args);
  }
}
