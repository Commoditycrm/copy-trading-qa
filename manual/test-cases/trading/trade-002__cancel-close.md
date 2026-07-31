# TRADE-002 / TRADE-003 — Cancel & close workflows

Parent: **TRADE-002** (own cancel/close, WF-17) and **TRADE-003** (bulk subscriber exit, WF-18).
Source: `backend/app/api/trades.py` (`cancel_trade`, `close_trade`, `cancel_all_open_orders`,
`cancel_all_subscribers_open_orders`), `backend/app/api/positions.py` (`close_position`,
`close_all_positions`, `close_all_subscribers_positions`), `cancel_intent`.

**Environment:** `[local-qa]` with **BROKER_MODE=fake**. Order/position-mutating cases `@destructive`.

---
```yaml
id: TC-TRADE-002-001
title: Trader cancels own working order — CANCELED with audit and SSE
primary_func_id: TRADE-002
related_func_ids: [WF-17]
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
automation_ref: automation/api/tests/trading/broker-lifecycle.spec.ts (TC-TRADE-002-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, destructive, requires-fake-broker, P1, regression]
source_refs: [POST /api/trades/{order_id}/cancel, backend/app/api/trades.py::cancel_trade]
evidence_requirements: [200; order CANCELED; audit order.cancelled; events order.cancelled]
```
**Preconditions:** Trader has a working (PENDING/SUBMITTED/ACCEPTED) order on a fake broker.
**Steps:** 1) POST /api/trades/{id}/cancel.
**Expected Results:** Order CANCELED; `audit order.cancelled`; SSE `order.cancelled`.

---
```yaml
id: TC-TRADE-002-002
title: Cancelling a terminal order returns 409 not_cancellable
primary_func_id: TRADE-002
related_func_ids: []
module: trading
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_002_002_cancel_terminal.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/trades.py::cancel_trade (status guard)]
evidence_requirements: [409 not_cancellable for FILLED/CANCELED/REJECTED order]
```
**Steps:** 1) Cancel an order already FILLED/CANCELED.
**Expected Results:** 409 `not_cancellable`.

---
```yaml
id: TC-TRADE-002-003
title: Cancelling another user's order returns 404 (ownership hidden)
primary_func_id: TRADE-002
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
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_002_003_cancel_cross_user.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, permission, security, P0]
source_refs: [backend/app/api/trades.py::cancel_trade (owner → 404)]
evidence_requirements: [404 for another user's order id; no state change]
```
**Steps:** 1) User B cancels user A's order.
**Expected Results:** 404 `not_found`; A's order unaffected.

---
```yaml
id: TC-TRADE-002-004
title: Close a filled stock position — reverse order created
primary_func_id: TRADE-002
related_func_ids: [POS-001, WF-17]
module: trading
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_002_004_close_filled.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, destructive, requires-fake-broker, P1]
source_refs: [POST /api/trades/{order_id}/close, backend/app/api/trades.py::close_trade]
evidence_requirements: [201; reverse-side order created; audit order.closed]
```
**Preconditions:** Filled long stock position.
**Steps:** 1) POST /api/trades/{id}/close (MARKET).
**Expected Results:** 201; reverse SELL created; `audit order.closed`.

---
```yaml
id: TC-TRADE-002-005
title: Option close is forced to LIMIT (never MARKET)
primary_func_id: TRADE-002
related_func_ids: [POS-001]
module: trading
test_level: L2
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_002_005_option_close_limit.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/positions.py::_option_close_limit, close paths]
evidence_requirements: [Option close order type=LIMIT with a positive marketable limit, not MARKET]
```
**Steps:** 1) Close an option position via close endpoint (no explicit type).
**Expected Results:** Close is placed as LIMIT at a marketable price (brokers reject option MARKET) — positive limit floor enforced.

---
```yaml
id: TC-TRADE-002-006
title: Close guards — not FILLED (409), quantity exceeds filled (422), broker disconnected (409)
primary_func_id: TRADE-002
related_func_ids: []
module: trading
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_002_006_close_guards.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, boundary, negative, P1]
source_refs: [backend/app/api/trades.py::close_trade (status/quantity/broker guards)]
evidence_requirements: [409 not_closeable; 422 quantity_exceeds_original_filled; 409 broker_disconnected]
```
**Steps (data-driven):** 1) Close a non-FILLED order → 409. 2) Close qty > filled → 422. 3) Close after broker deleted (broker_account_id null) → 409.
**Expected Results:** As annotated; partial-quantity close (≤ filled) succeeds.

---
```yaml
id: TC-TRADE-002-007
title: Cancel-all-open with include_subscribers=false suppresses the mirror cascade (no-cascade marker)
primary_func_id: TRADE-002
related_func_ids: [TRADE-003]
module: trading
test_level: L3
test_type: Concurrency
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_trade_002_007_cancel_all_no_cascade.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, trading, concurrency, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/trades.py::cancel_all_open_orders, backend/app/services/cancel_intent.py]
evidence_requirements: [Trader's open orders cancelled; subscriber mirrors NOT cascaded when include_subscribers=false]
```
**Steps:** 1) Trader has open orders + subscriber mirrors. 2) POST cancel-all-open?include_subscribers=false.
**Expected Results:** Trader's orders cancelled; the `cancel_intent` no-cascade marker prevents the listener from cancelling subscriber mirrors the trader chose to keep. (With include_subscribers=true, mirrors DO cascade.)

---
```yaml
id: TC-TRADE-003-001
title: Bulk-cancel subscribers' open orders is queued async and returns immediately
primary_func_id: TRADE-003
related_func_ids: [WF-18]
module: trading
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_trade_003_001_bulk_cancel_subscribers.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, trading, destructive, requires-fake-broker, requires-seed, P2]
source_refs: [POST /api/trades/cancel-all-subscribers-open, backend/app/api/trades.py]
evidence_requirements: [Immediate {queued_count}; mirrors cancelled by background task; per-order SSE]
```
**Steps:** 1) Seed subscriber mirrors. 2) Trader POSTs cancel-all-subscribers-open.
**Expected Results:** Returns immediately with `queued_count`; background task cancels each mirror (concurrency 4, 60s timeout); per-order `order.cancelled` SSE; timeouts recorded (listener reconciles).

---
```yaml
id: TC-TRADE-003-002
title: Bulk-close subscribers' positions is queued async (trader's own positions untouched)
primary_func_id: TRADE-003
related_func_ids: [POS-001, WF-18]
module: trading
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_trade_003_002_bulk_close_subscribers.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, trading, destructive, requires-fake-broker, requires-seed, P2]
source_refs: [POST /api/positions/close-all-subscribers, backend/app/api/positions.py]
evidence_requirements: [Immediate {queued_pairs}; subscriber positions flattened; trader positions unchanged]
```
**Steps:** 1) Seed subscriber positions + a trader position. 2) Trader POSTs close-all-subscribers.
**Expected Results:** Returns `queued_pairs`; subscriber positions flattened (options→LIMIT); the trader's own positions are not touched.
```
