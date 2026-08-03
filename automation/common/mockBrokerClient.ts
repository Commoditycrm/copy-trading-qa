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
  current_price?: number | string;
  market_value?: number | string;
  unrealized_pnl?: number | string; // drives the position TP/SL enforcer
  cost_basis?: number | string; // pct = unrealized_pnl / abs(cost_basis) * 100
  option_strike?: number | string;
  option_right?: 'call' | 'put';
  option_expiry?: string; // ISO date — set to today (ET) for a same-day-expiry (0DTE) position
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

  /** Per-subscriber scenario override (alias of setPlaceOrderResult, keyed by that sub's broker account). */
  setSubscriberScenario(accountId: string, mode: PlaceMode, opts: { reason?: string } = {}): Promise<any> {
    return this.setPlaceOrderResult(accountId, mode, opts);
  }

  async getCallHistory(accountId?: string): Promise<CallRecord[]> {
    const q = `?run_id=${encodeURIComponent(this.runId)}${accountId ? `&account_id=${accountId}` : ''}`;
    return (await admin('GET', `/admin/call-history${q}`)).calls;
  }
  async getOrderHistory(accountId?: string): Promise<any[]> {
    const q = `?run_id=${encodeURIComponent(this.runId)}${accountId ? `&account_id=${accountId}` : ''}`;
    return (await admin('GET', `/admin/order-history${q}`)).orders;
  }
  async getEventHistory(): Promise<any[]> {
    return (await admin('GET', `/admin/events?run_id=${encodeURIComponent(this.runId)}`)).events;
  }
  /** count broker calls of a given method (optionally on one account). */
  async callCount(method: CallRecord['method'], accountId?: string): Promise<number> {
    return (await this.getCallHistory(accountId)).filter((c) => c.method === method).length;
  }
  /** count broker PLACE calls flagged is_closing (exits) — bounds the number of exits reaching the broker. */
  async getExitCallCount(accountId?: string): Promise<number> {
    const q = `?run_id=${encodeURIComponent(this.runId)}${accountId ? `&account_id=${accountId}` : ''}`;
    return (await admin('GET', `/admin/exit-call-count${q}`)).exit_calls;
  }

  // ── grey-box: drive the app's real logic with the controllable adapter ──
  private drive(action: string, args: object, container: 'backend' | 'worker' = 'backend'): any {
    const spec = Buffer.from(JSON.stringify({ action, run_id: this.runId, ...args })).toString('base64');
    execSync(`docker compose -f "${compose}" cp "${driver}" ${container}:/tmp/qa_driver.py`, { stdio: ['ignore', 'ignore', 'pipe'] });
    const out = execSync(
      `docker compose -f "${compose}" exec -T -e PYTHONPATH=/app -e DRIVER_SPEC_B64=${spec} ${container} python /tmp/qa_driver.py`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    const line = out.split('\n').filter(Boolean).pop() || '{}';
    return JSON.parse(line);
  }

  /** Run the app's fills-sync poll for an account (get_order → DB), so configured fills land. */
  syncFills(accountId: string): any {
    return this.drive('refresh_fills', { account_id: accountId });
  }

  // ── bracket / OCO (grey-box: drives the app's real bracket_emulator) ──
  /** Configure the entry's fill so a subsequent emitEntryFill fills it (status + qty + price). */
  configureBracketScenario(entryOrderId: string, fill: { quantity: number | string; price: number | string }): Promise<any> {
    return this.setOrderStatus(entryOrderId, 'filled', fill.quantity, fill.price);
  }
  /** Fill the entry, then run the real emulator → returns the created TP/SL legs. */
  emitEntryFill(accountId: string, entryOrderId: string): { legs: Array<{ id: string; bracket_leg: string; status: string }> } {
    this.syncFills(accountId);
    return this.drive('emulate_bracket', { entry_order_id: entryOrderId });
  }
  /** Re-run the emulator only (no fill-sync) — used to prove idempotency without auto-filling live legs. */
  emulateBracketOnly(entryOrderId: string): { legs: Array<{ id: string; bracket_leg: string; status: string }> } {
    return this.drive('emulate_bracket', { entry_order_id: entryOrderId });
  }
  emitPartialFill(accountId: string, orderId: string, quantity: number | string, price: number | string): any {
    return (async () => { await this.setOrderStatus(orderId, 'partially_filled', quantity, price); return this.syncFills(accountId); })();
  }
  emitFullFill(accountId: string, orderId: string, quantity: number | string, price: number | string): any {
    return (async () => { await this.setOrderStatus(orderId, 'filled', quantity, price); return this.syncFills(accountId); })();
  }
  /** Fill a TP leg and run OCO sibling-cancel → returns sibling state. */
  emitTakeProfitFill(tpLegId: string): { sibling_cancelled: boolean; legs: Array<{ id: string; bracket_leg: string; status: string }> } {
    return this.drive('fill_leg_oco', { leg_order_id: tpLegId });
  }
  emitStopLossFill(slLegId: string): { sibling_cancelled: boolean; legs: Array<{ id: string; bracket_leg: string; status: string }> } {
    return this.drive('fill_leg_oco', { leg_order_id: slLegId });
  }
  /** Re-emit a fill for an already-filled leg — must NOT create a second exit. */
  emitDuplicateFill(legId: string): any {
    return this.drive('fill_leg_oco', { leg_order_id: legId });
  }
  /** Drive the app's real fanout on one order (exercises the bracket-parent guard). Returns fanned count. */
  fanoutOrder(orderId: string): { fanned: number } {
    return this.drive('fanout_order', { order_id: orderId });
  }
  /** Run N concurrent close attempts (default 2) and await all. */
  async runConcurrentClose<T>(fn: () => Promise<T>, n = 2): Promise<Array<T | null>> {
    return Promise.all(Array.from({ length: n }, () => fn().catch(() => null)));
  }
  /** Run the app's retry scheduler over one order (re-place a RETRY_PENDING child). */
  runRetry(orderId: string): any {
    return this.drive('run_retry', { order_id: orderId });
  }
  /** Seed today's FIFO-realized P&L for a subscriber (matched BUY→SELL); pnl = (sell-buy)*qty. */
  seedPnl(userId: string, accountId: string, o: { symbol?: string; quantity: number; buy_price: number; sell_price: number }): { seeded_pnl: string } {
    return this.drive('seed_pnl', { user_id: userId, account_id: accountId, ...o });
  }
  /** Run the app's real per-position TP/SL enforcer against the mock adapter's positions. */
  enforcePositionTpSl(userId: string, accountId: string): { closed_count: number; closed: string[] } {
    return this.drive('enforce_tp_sl', { user_id: userId, account_id: accountId });
  }
  /** Warm the per-trader subscriber cache (cache:subs:<trader>) via the app's own cache read. */
  warmSubsCache(traderId: string): any {
    return this.drive('warm_subs_cache', { trader_id: traderId });
  }
  /** Set the broker P&L snapshot the poller reads (equity/beginning_day_balance/todays_pl). */
  setPnlSnapshot(accountId: string, snapshot: { todays_pl?: number; equity?: number; beginning_day_balance?: number; todays_realized?: number }): Promise<any> {
    return admin('POST', '/admin/pnl-snapshot', { run_id: this.runId, account_id: accountId, snapshot });
  }
  /** Run the app's real poller tick for one subscriber account (auto-resume / kill-switch / liquidation). */
  pollerEnforce(accountId: string): { copy_enabled: boolean | null; auto_liquidated: boolean | null } {
    return this.drive('poller_enforce', { account_id: accountId });
  }

  // ── background jobs / recovery (grey-box) ──
  /** One poll pass over several accounts (crash-isolated per account). Returns each account's state. */
  pollerPass(accountIds: string[]): { accounts: Record<string, { copy_enabled: boolean | null; auto_liquidated: boolean | null; paused: boolean | null }> } {
    return this.drive('poller_pass', { account_ids: accountIds });
  }
  /** Worker-boot crash recovery: replay orphaned PENDING child orders. */
  recoverySweep(): { recovered: number } {
    return this.drive('recovery_sweep', {});
  }
  /** Seed a PENDING mirror child old enough for recovery to replay it. */
  seedPendingChild(userId: string, accountId: string, parentOrderId: string, opts: { symbol?: string; quantity?: number } = {}): { child_id: string } {
    return this.drive('seed_pending_child', { user_id: userId, account_id: accountId, parent_order_id: parentOrderId, ...opts });
  }
  /** Record (or dedup) the day-start equity snapshot for an account. Returns the row count for that account. */
  dayStartEquity(accountId: string, equity: number, utcDate?: string): { value: string; rows: number } {
    return this.drive('day_start_equity', { account_id: accountId, equity, utc_date: utcDate });
  }
  /** Run the app's position reconciler for one account (dry-run or apply). Returns synthetic-close count. */
  reconcilePosition(accountId: string, apply: boolean): { synthetic_closes: number } {
    return this.drive('reconcile_position', { account_id: accountId, apply });
  }
  /** Read the retry scheduler heartbeat status from the WORKER process (where it runs). */
  retryHeartbeat(): { heartbeat: { running: boolean; healthy: boolean; last_run_at: string | null; seconds_since: number | null } } {
    return this.drive('retry_heartbeat', {}, 'worker');
  }
  /** Create a notification via the app (triggers the inline 30-day retention purge for that user). */
  createNotif(userId: string, type: string, message = 'qa'): { created: boolean } {
    return this.drive('create_notif', { user_id: userId, type, message });
  }
  /** Run the EOD auto-close tick with a QA-injected ET clock (driver rebinds market_hours.now_et). */
  eodTick(frozenEt: string): { ticked: boolean } {
    return this.drive('eod_tick', { frozen_et: frozenEt });
  }
  /** Emit a broker order/fill event into the app's real listener handler (echo/duplicate/replay). */
  emitBrokerEvent(args: { trader_id: string; account_id: string; order_id?: string; client_order_id?: string; broker_order_id?: string; event?: string; status?: string; submitted_at?: string; symbol?: string; side?: string; quantity?: number | string }): any {
    return this.drive('emit_event', args);
  }
}
