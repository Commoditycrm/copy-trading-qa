/**
 * LOCAL-ONLY trading fixtures. Seeds fake broker accounts + follow/copy state (so a trader order
 * fans out) by docker-execing the app's own seed script into the disposable local stack, and reads
 * back orders/markers for assertions. Refuses to run outside env=local and only on @qa.kopyya.dev
 * users. Never touches production or real broker data.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { QaConfig } from './config.js';
import { RUN_ID } from './factory.js';

const here = dirname(fileURLToPath(import.meta.url));
const compose = resolve(here, '../local-stack/docker-compose.qa.yml');
const seedScript = resolve(here, '../local-stack/seed_trading.py');

function assertLocal(cfg: QaConfig): void {
  if (cfg.envName !== 'local') throw new Error(`[SAFETY] tradingSetup refuses to run in env=${cfg.envName} (local only)`);
}
function dc(args: string, input?: string): string {
  try {
    return execSync(`docker compose -f "${compose}" ${args}`, {
      encoding: 'utf8',
      stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
      input,
    }).trim();
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`docker compose ${args} failed: ${(err.stderr || err.message || '').toString().trim()}`);
  }
}
function psql(sql: string): string {
  return dc(`exec -T db psql -U qa -d copytrading_qa -tAc "${sql.replace(/"/g, '\\"')}"`);
}
function redis(args: string): string {
  return dc(`exec -T redis redis-cli -a qaredispass ${args}`);
}

export interface SubSpec {
  email: string;
  multiplier?: string | number;
  copy_enabled?: boolean; // default true
  follow?: boolean; // default true — sets following_trader_id
  broker?: boolean; // default true — attach a fake broker account
  retry_open?: '1m' | '2m' | '3m' | '5m'; // enable transient-retry (default NEVER)
  retry_close?: '1m' | '2m' | '3m' | '5m';
  retry_max_attempts?: number;
  symbol_exclusion?: string[]; // uppercase tickers to skip mirroring
  symbol_inclusion?: string[];
}
export interface FanoutSeed {
  trader_id: string;
  trader_account_id: string;
  subscribers: Array<{ email: string; user_id: string; account_id: string | null }>;
}
export interface ChildOrder {
  userId: string;
  quantity: string;
  status: string;
  brokerOrderId: string;
}

/** Attach fake broker accounts + follow/copy state; returns the trader account id used to place orders. */
export function seedFanout(cfg: QaConfig, traderEmail: string, subs: SubSpec[]): FanoutSeed {
  assertLocal(cfg);
  const all = [traderEmail, ...subs.map((s) => s.email)];
  for (const e of all) if (!e.endsWith('@qa.kopyya.dev')) throw new Error(`[SAFETY] tradingSetup only operates on @qa.kopyya.dev users (got ${e})`);

  const specB64 = Buffer.from(JSON.stringify({ trader_email: traderEmail, subscribers: subs, run_id: RUN_ID })).toString('base64');
  dc(`cp "${seedScript}" backend:/tmp/qa_seed_trading.py`);
  // PYTHONPATH=/app: running `python /tmp/x.py` puts /tmp (not the app root) on sys.path.
  const out = dc(`exec -T -e PYTHONPATH=/app -e SEED_SPEC_B64=${specB64} backend python /tmp/qa_seed_trading.py`);
  const line = out.split('\n').filter(Boolean).pop() ?? '';
  try {
    return JSON.parse(line) as FanoutSeed;
  } catch {
    throw new Error(`seedFanout: could not parse seed output: ${out}`);
  }
}

/** All child (mirror) orders whose parent is the given trader order id. */
export function childOrders(cfg: QaConfig, parentOrderId: string): ChildOrder[] {
  assertLocal(cfg);
  // status enum persists as UPPERCASE member names; lower() yields the enum .value.
  const rows = psql(
    `SELECT user_id||'|'||quantity||'|'||lower(status::text)||'|'||COALESCE(broker_order_id,'') ` +
      `FROM orders WHERE parent_order_id='${parentOrderId}' ORDER BY user_id`,
  );
  if (!rows) return [];
  return rows.split('\n').map((r) => {
    const [userId = '', quantity = '', status = '', brokerOrderId = ''] = r.split('|');
    return { userId, quantity, status, brokerOrderId };
  });
}

/** Count a trader's own (parent) orders for a symbol — used to assert no duplicate parent was created. */
export function parentOrderCount(cfg: QaConfig, traderUserId: string, symbol: string): number {
  assertLocal(cfg);
  const n = psql(
    `SELECT count(*) FROM orders WHERE user_id='${traderUserId}' AND symbol='${symbol}' AND parent_order_id IS NULL`,
  );
  return Number(n || '0');
}

export interface OrderRow {
  status: string;
  reject_reason: string;
  filled_quantity: string;
  quantity: string;
  side: string;
  is_closing: boolean;
  retry_count: string;
  hasRetryAt: boolean;
  retryAt: string;
}

/** Read the key lifecycle columns of one order row (empty status = not found). */
export function orderRow(cfg: QaConfig, orderId: string): OrderRow {
  assertLocal(cfg);
  const r = psql(
    `SELECT lower(status::text)||'|'||COALESCE(reject_reason,'')||'|'||filled_quantity||'|'||is_closing||'|'||` +
      `retry_count||'|'||COALESCE(retry_at::text,'')||'|'||quantity||'|'||lower(side::text) FROM orders WHERE id='${orderId}'`,
  );
  const [status = '', reject_reason = '', filled_quantity = '', is_closing = '', retry_count = '', retryAt = '', quantity = '', side = ''] = r.split('|');
  return { status, reject_reason, filled_quantity, quantity, side, is_closing: is_closing === 't', retry_count, hasRetryAt: retryAt !== '', retryAt };
}

/** Newest order id for a user+symbol other than `excludeId` (empty if none) — e.g. a subscriber's close mirror. */
export function newestOrderIdForUser(cfg: QaConfig, userId: string, symbol: string, excludeId: string): string {
  assertLocal(cfg);
  return psql(
    `SELECT id FROM orders WHERE user_id='${userId}' AND symbol='${symbol}' AND id <> '${excludeId}' ` +
      `ORDER BY created_at DESC LIMIT 1`,
  );
}

/** The single child (mirror) order for one subscriber under a parent (or null). */
export function childForUser(cfg: QaConfig, parentOrderId: string, userId: string): OrderRow | null {
  assertLocal(cfg);
  const id = psql(`SELECT id FROM orders WHERE parent_order_id='${parentOrderId}' AND user_id='${userId}' LIMIT 1`);
  return id ? orderRow(cfg, id) : null;
}

/** Count audit_logs rows for an action (optionally scoped to an entity id). */
export function auditCount(cfg: QaConfig, action: string, entityId?: string): number {
  assertLocal(cfg);
  const where = entityId ? `action='${action}' AND entity_id='${entityId}'` : `action='${action}'`;
  return Number(psql(`SELECT count(*) FROM audit_logs WHERE ${where}`) || '0');
}

/** Count fills rows written for an order (real fill-sync assertion). */
export function fillCount(cfg: QaConfig, orderId: string): number {
  assertLocal(cfg);
  return Number(psql(`SELECT count(*) FROM fills WHERE order_id='${orderId}'`) || '0');
}

/** True when a mirror carries its fanout performance stamp (subscriber_picked_at). */
export function subscriberPickedAtSet(cfg: QaConfig, orderId: string): boolean {
  assertLocal(cfg);
  return psql(`SELECT subscriber_picked_at IS NOT NULL FROM orders WHERE id='${orderId}'`) === 't';
}

/** Count a trader's real ENTRY parents (excludes copy-mirrors and bracket exit legs). */
export function traderEntryCount(cfg: QaConfig, userId: string, symbol: string): number {
  assertLocal(cfg);
  return Number(psql(
    `SELECT count(*) FROM orders WHERE user_id='${userId}' AND symbol='${symbol}' ` +
      `AND parent_order_id IS NULL AND bracket_parent_id IS NULL`,
  ) || '0');
}

/** Count bracket exit legs under an entry (bracket_parent_id = entryId). */
export function bracketLegCount(cfg: QaConfig, entryId: string): number {
  assertLocal(cfg);
  return Number(psql(`SELECT count(*) FROM orders WHERE bracket_parent_id='${entryId}'`) || '0');
}

/** Count / sum a user's orders on one side for a symbol (concurrent-close bounds). */
export function sideOrderCount(cfg: QaConfig, userId: string, symbol: string, side: 'buy' | 'sell'): number {
  assertLocal(cfg);
  return Number(psql(
    `SELECT count(*) FROM orders WHERE user_id='${userId}' AND symbol='${symbol}' AND lower(side::text)='${side}'`,
  ) || '0');
}
export function sideQtySum(cfg: QaConfig, userId: string, symbol: string, side: 'buy' | 'sell'): number {
  assertLocal(cfg);
  return Number(psql(
    `SELECT COALESCE(sum(quantity),0) FROM orders WHERE user_id='${userId}' AND symbol='${symbol}' AND lower(side::text)='${side}'`,
  ) || '0');
}

/** The most recent parent order id for a trader+symbol (empty if none). */
export function latestParentOrderId(cfg: QaConfig, traderUserId: string, symbol: string): string {
  assertLocal(cfg);
  return psql(
    `SELECT id FROM orders WHERE user_id='${traderUserId}' AND symbol='${symbol}' AND parent_order_id IS NULL ` +
      `ORDER BY created_at DESC LIMIT 1`,
  );
}

/** The child (mirror) order id for one subscriber under a parent (empty if none). */
export function childId(cfg: QaConfig, parentOrderId: string, userId: string): string {
  assertLocal(cfg);
  return psql(`SELECT id FROM orders WHERE parent_order_id='${parentOrderId}' AND user_id='${userId}' LIMIT 1`);
}

/** Newest parent order for a trader+symbol other than `excludeId` — used to find a close/reverse order. */
export function otherParentOrderId(cfg: QaConfig, traderUserId: string, symbol: string, excludeId: string): string {
  assertLocal(cfg);
  return psql(
    `SELECT id FROM orders WHERE user_id='${traderUserId}' AND symbol='${symbol}' AND parent_order_id IS NULL ` +
      `AND id <> '${excludeId}' ORDER BY created_at DESC LIMIT 1`,
  );
}

/** Set a subscriber's symbol exclusion list (fast-follow: symbol filters). Column is JSONB. */
export function setSymbolExclusion(cfg: QaConfig, subUserId: string, symbols: string[]): void {
  assertLocal(cfg);
  const json = JSON.stringify(symbols).replace(/'/g, "''");
  psql(`UPDATE subscriber_settings SET symbol_exclusion_list='${json}'::jsonb WHERE user_id='${subUserId}'`);
}

/** True while the app-originated Redis marker for an order is live (dup-fanout guard mechanism). */
export function appOriginatedMarkerSet(cfg: QaConfig, orderId: string): boolean {
  assertLocal(cfg);
  return redis(`EXISTS "order:app_originated:${orderId}"`) === '1';
}

/** Read a single subscriber_settings column as text ('' if null/absent). */
export function subSetting(cfg: QaConfig, userId: string, col: string): string {
  assertLocal(cfg);
  return psql(`SELECT COALESCE(${col}::text,'') FROM subscriber_settings WHERE user_id='${userId}'`);
}

/** Set a subscriber_settings column to a raw SQL expression (e.g. backdate a stamp). LOCAL-ONLY. */
export function setSubSettingRaw(cfg: QaConfig, userId: string, col: string, sqlExpr: string): void {
  assertLocal(cfg);
  psql(`UPDATE subscriber_settings SET ${col}=${sqlExpr} WHERE user_id='${userId}'`);
}

/** True while the per-trader subscriber cache snapshot is populated (cache:subs:<traderId>). */
export function subscriberCacheExists(cfg: QaConfig, traderId: string): boolean {
  assertLocal(cfg);
  return redis(`EXISTS "cache:subs:${traderId}"`) === '1';
}

/** Count audit_logs rows for an action, optionally scoped to an actor (per-user isolation checks). */
export function auditByActor(cfg: QaConfig, action: string, actorUserId?: string): number {
  assertLocal(cfg);
  const where = actorUserId ? `action='${action}' AND actor_user_id='${actorUserId}'` : `action='${action}'`;
  return Number(psql(`SELECT count(*) FROM audit_logs WHERE ${where}`) || '0');
}

/** Count notifications for a user, optionally of a given type. */
export function notifCount(cfg: QaConfig, userId: string, type?: string): number {
  assertLocal(cfg);
  const where = type ? `user_id='${userId}' AND type='${type}'` : `user_id='${userId}'`;
  return Number(psql(`SELECT count(*) FROM notifications WHERE ${where}`) || '0');
}

/** Read a broker_accounts column as text ('' if null/absent). */
export function brokerAccountField(cfg: QaConfig, accountId: string, col: string): string {
  assertLocal(cfg);
  return psql(`SELECT COALESCE(${col}::text,'') FROM broker_accounts WHERE id='${accountId}'`);
}

/** True while a broker account row exists. */
export function brokerAccountExists(cfg: QaConfig, accountId: string): boolean {
  assertLocal(cfg);
  return psql(`SELECT count(*) FROM broker_accounts WHERE id='${accountId}'`) === '1';
}

/** Flip a trader's kill-switch (trading_enabled) — for the disabled-trading 409 path. */
export function setTradingEnabled(cfg: QaConfig, traderEmail: string, enabled: boolean): void {
  assertLocal(cfg);
  if (!traderEmail.endsWith('@qa.kopyya.dev')) throw new Error(`[SAFETY] only @qa.kopyya.dev traders (got ${traderEmail})`);
  psql(
    `UPDATE trader_settings SET trading_enabled=${enabled ? 'true' : 'false'} ` +
      `WHERE user_id=(SELECT id FROM users WHERE email='${traderEmail}')`,
  );
}
