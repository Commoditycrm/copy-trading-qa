# TRADE-001 — Trader order placement (+ duplicate prevention, data integrity, audit)

Parent: **TRADE-001** (baseline §29), workflow **WF-10**. Endpoint: `POST /api/trades?broker_account_id=`.
Source: `backend/app/api/trades.py::place_trade`, `_place_trader_order` (advisory lock + 3s dedup, broker
retries), `backend/app/schemas/order.py::PlaceOrderIn`, `backend/app/services/copy_engine.py::fanout_async`,
`backend/app/services/order_intent.py`, `backend/app/services/audit.py`, `backend/app/services/events.py`.

**Environment:** all cases `[local-qa]` (or `qa`) with **BROKER_MODE=fake**. All order-writing cases are
`@destructive` (fake broker + non-prod only). **Never production.**

---
```yaml
id: TC-TRADE-001-001
title: Trader places a market BUY (stock) on a fake broker — accepted and recorded
primary_func_id: TRADE-001
related_func_ids: [WF-10]
module: trading
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/order-placement.spec.ts (TC-TRADE-001-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, destructive, requires-fake-broker, P1, regression]
source_refs:
  - POST /api/trades
  - backend/app/api/trades.py::place_trade, _place_trader_order
  - backend/app/schemas/order.py::PlaceOrderIn
evidence_requirements:
  - 201 OrderOut (status SUBMITTED/ACCEPTED/FILLED per fake profile)
  - DB: Order row (side=buy, type=market, broker_order_id set); audit trader.order_placed
  - SSE order.placed observed
```
**Preconditions:** Trader with a connected **fake** broker account; `trading_enabled=true`.
**Test Data:** symbol AAPL, quantity 1, MARKET, BUY.
**Steps:** 1) POST /api/trades?broker_account_id=<fake> with the payload.
**Expected Results:** 201 `OrderOut`; broker id stamped; `audit trader.order_placed`; `events order.placed` published; lifecycle timestamps set.

---
```yaml
id: TC-TRADE-001-002
title: Trader places a limit BUY (option) with valid OCC fields
primary_func_id: TRADE-001
related_func_ids: [OPT-001]
module: trading
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/fast-follow.spec.ts (TC-TRADE-001-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, destructive, requires-fake-broker, P1]
source_refs: [POST /api/trades, backend/app/schemas/order.py::PlaceOrderIn (option fields)]
evidence_requirements: [201; option_expiry/strike/right + limit_price persisted]
```
**Test Data:** symbol AAPL, instrument OPTION, expiry (valid future), strike, right=call, LIMIT, limit_price>0, qty 1.
**Steps:** 1) POST place order.
**Expected Results:** 201; option fields + limit_price stored; order accepted on fake broker.

---
```yaml
id: TC-TRADE-001-003
title: Order validation — missing required fields rejected (422)
primary_func_id: TRADE-001
related_func_ids: []
module: trading
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/order-placement.spec.ts (TC-TRADE-001-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, negative, P1]
source_refs: [backend/app/schemas/order.py::PlaceOrderIn (model_validator)]
evidence_requirements: [422 per sub-case; no order created]
```
**Test Data / Steps (data-driven):**
1. LIMIT without limit_price → 422.
2. STOP without stop_price → 422.
3. OPTION missing expiry/strike/right → 422.
4. quantity = 0 or negative → 422.
5. bracket TP/SL on a STOP order (bracket only on MARKET/LIMIT) → 422.
**Expected Results:** 422 each; no order row created (validation is server-side, not bypassable).

---
```yaml
id: TC-TRADE-001-004
title: Bracket geometry enforced on entry (buy: sl < limit < tp)
primary_func_id: TRADE-001
related_func_ids: [TRADE-004]
module: trading
test_level: L2
test_type: Boundary
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/fast-follow.spec.ts (TC-TRADE-001-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, boundary, negative, P1]
source_refs: [backend/app/schemas/order.py::PlaceOrderIn (bracket relationship validator)]
evidence_requirements: [422 when geometry violated; 201 when valid]
```
**Test Data / Steps:** BUY LIMIT with (a) tp ≤ limit → 422; (b) sl ≥ limit → 422; (c) sl < limit < tp → 201. Repeat inverted for SELL.
**Expected Results:** Directional geometry enforced at the boundary.

---
```yaml
id: TC-TRADE-001-005
title: Trader kill-switch — placing while trading_disabled returns 409
primary_func_id: TRADE-001
related_func_ids: [AUTHZ-001]
module: trading
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/order-placement.spec.ts (TC-TRADE-001-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, permission, negative, P1]
source_refs: [backend/app/api/trades.py::_place_trader_order (trader_can_trade → 409 trading_disabled)]
evidence_requirements: [409 trading_disabled; no order]
```
**Preconditions:** Trader with `TraderSettings.trading_enabled=false`.
**Steps:** 1) POST place order.
**Expected Results:** 409 `trading_disabled`; no order created.

---
```yaml
id: TC-TRADE-001-006
title: Ownership — placing on a broker account not owned by the trader returns 404
primary_func_id: TRADE-001
related_func_ids: [AUTHZ-001]
module: trading
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/order-placement.spec.ts (TC-TRADE-001-006)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, permission, security, P0]
source_refs: [backend/app/api/trades.py::_place_trader_order (broker_account ownership → 404)]
evidence_requirements: [404 broker_account_not_found using another trader's account id]
```
**Preconditions:** Trader A; broker account belongs to trader B.
**Steps:** 1) A POSTs place order with B's broker_account_id.
**Expected Results:** 404 `broker_account_not_found` — no cross-tenant order routing.

---
```yaml
id: TC-TRADE-001-007
title: Duplicate-order prevention — identical concurrent orders are deduped (advisory lock + 3s window)
primary_func_id: TRADE-001
related_func_ids: [WF-10]
module: trading
test_level: L2
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/order-placement.spec.ts (TC-TRADE-001-007)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, concurrency, destructive, requires-fake-broker, P0]
source_refs:
  - backend/app/api/trades.py::_place_trader_order (pg_advisory_xact_lock, DEDUP_WINDOW=3s)
  - baseline §15.1
evidence_requirements: [Two identical near-simultaneous POSTs → ONE order row; second returns the existing order]
```
**Preconditions:** Fake broker; trader can trade.
**Test Data:** identical payload (same symbol/side/type/qty/price).
**Steps:** 1) Fire two identical POSTs concurrently (and a third within 3s).
**Expected Results:** Exactly **one** order created; duplicates return the same order (no double placement). Core financial-safety invariant.

---
```yaml
id: TC-TRADE-001-008
title: Broker rejection path — 502 with reject_reason, audit, and trader notification
primary_func_id: TRADE-001
related_func_ids: [COPY-003]
module: trading
test_level: L2
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/broker-lifecycle.spec.ts (TC-TRADE-001-008)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, recovery, negative, requires-fake-broker, P1]
source_refs: [backend/app/api/trades.py::_place_trader_order (reject → REJECTED + 502 + notify)]
evidence_requirements: [502 broker_error; order REJECTED with reject_reason; audit trader.order_rejected_at_broker; trader notification]
```
**Preconditions:** Fake broker configured to reject (error profile).
**Steps:** 1) POST place order that the fake broker rejects.
**Expected Results:** Order stamped REJECTED + `reject_reason`; `audit trader.order_rejected_at_broker`; in-app (and SMS if enabled) trader notification; HTTP 502 `broker_error`.

---
```yaml
id: TC-TRADE-001-009
title: Data integrity & audit — successful placement writes exactly one order, fill linkage, and audit trail
primary_func_id: TRADE-001
related_func_ids: []
module: trading
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/broker-lifecycle.spec.ts (TC-TRADE-001-009)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, trading, data-integrity, requires-fake-broker, P1]
source_refs: [backend/app/api/trades.py, backend/app/models/order.py, backend/app/services/audit.py]
evidence_requirements:
  - Exactly one Order row per placement; filled_quantity ≤ quantity (no over-fill)
  - audit trail (order_placed, and fanout_complete when applicable) present and ordered
```
**Steps:** 1) Place order. 2) Query order + fills + audit rows for the order id.
**Expected Results:** One order; fills (if any) linked and summed correctly (`filled_quantity ≤ quantity`, no double-count); audit records present with correct actor/action. Non-fractionable rounding (if triggered) audited `order.rounded_to_whole`.

---
```yaml
id: TC-TRADE-001-010
title: App-originated marker prevents listener double-fanout of the trader's own order
primary_func_id: TRADE-001
related_func_ids: [COPY-001, JOB-002]
module: trading
test_level: L3
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/listener-guard.spec.ts (TC-TRADE-001-010)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, trading, concurrency, destructive, requires-fake-broker, P0]
source_refs:
  - backend/app/services/order_intent.py::mark_app_originated / is_app_originated
  - baseline §12.1 (anti-doubling defenses)
evidence_requirements: [A trader order placed via API is fanned out ONCE, not twice (once by API + once by listener)]
```
**Preconditions:** Fake trader broker with a listener running; at least one active subscriber (fake).
**Steps:** 1) Place a trader order via the API. 2) Allow the broker listener to also observe it.
**Expected Results:** The order is fanned out exactly once (the `order_intent` app-originated marker suppresses the listener path) — no duplicate mirror orders. Financial-safety invariant.
```
