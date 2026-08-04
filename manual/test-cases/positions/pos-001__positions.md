# POS-001 — Positions & bulk-exit

Parent **POS-001**, with **TRADE-003** (bulk subscriber exit — cases TC-TRADE-003-001/002 already exist).
Endpoints `/api/positions*`. Source: `backend/app/api/positions.py` (`list_positions`, `close_position`,
`close_all_positions`, `close_all_subscribers_positions`, `_option_close_limit`, `_close_account_positions_sync`),
`frontend/components/OpenPositionsTable.tsx` / `BulkExitBar.tsx`.

**Environment:** read cases `[local-qa, qa]`; close cases `[local-qa]` **BROKER_MODE=fake** (`@destructive`). **Never production.**

---
```yaml
id: TC-POS-001-001
title: List aggregate open positions across all connected broker accounts
primary_func_id: POS-001
related_func_ids: []
module: positions
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/positions.spec.ts (TC-POS-001-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, positions, destructive, requires-fake-broker, P1]
source_refs: [GET /api/positions, backend/app/api/positions.py::list_positions, schemas/position.py::PositionOut]
evidence_requirements: [200 aggregated PositionOut across connected accounts; signed quantity; option fields populated; own accounts only]
```
**Steps:** 1) Hold positions on ≥1 fake account. 2) GET /api/positions.
**Expected Results:** Aggregated positions returned (signed qty, symbol, option fields); scoped to the caller.

---
```yaml
id: TC-POS-001-002
title: One broker outage silently drops that account's rows (per-account error swallow)
primary_func_id: POS-001
related_func_ids: []
module: positions
test_level: L3
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_pos_001_002_account_error_swallow.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, positions, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/positions.py::list_positions (per-account except: continue — baseline §23)]
evidence_requirements: [A failing account's positions are omitted; other accounts still returned; no 500]
```
**Steps:** 1) Two accounts, one broker errors. 2) GET /api/positions.
**Expected Results:** Healthy account's rows returned; failing account silently omitted (documented behavior — the table won't blank). Note: a silent drop could hide a real outage — record as an observation.

---
```yaml
id: TC-POS-001-003
title: Close a single position — reverse side; options forced to LIMIT
primary_func_id: POS-001
related_func_ids: [TRADE-002]
module: positions
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/positions.spec.ts (TC-POS-001-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, positions, destructive, requires-fake-broker, P1]
source_refs: [POST /api/positions/{broker_symbol}/close?broker_account_id=, backend/app/api/positions.py::close_position, _option_close_limit]
evidence_requirements: [201 OrderOut; reverse-side order sized to live holding; option close type=LIMIT at marketable price]
```
**Steps:** 1) Close a stock position (MARKET). 2) Close an option position (no explicit type).
**Expected Results:** Reverse order created; stock MARKET; option LIMIT at marketable price; re-reads live holding (404 if position_not_found).

---
```yaml
id: TC-POS-001-004
title: Close guards — ownership, broker connection, position existence, quantity bounds
primary_func_id: POS-001
related_func_ids: [AUTHZ-001]
module: positions
test_level: L2
test_type: Boundary
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/positions.spec.ts (TC-POS-001-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, positions, boundary, permission, security, P0]
source_refs: [backend/app/api/positions.py::close_position (owner→404; broker_not_connected 409; position_not_found 404; qty 422)]
evidence_requirements: [Another user's account_id → 404; disconnected broker → 409; no position → 404; qty ≤0 or > held → 422]
```
**Steps (data-driven):** other user's account_id; disconnected broker; non-existent position; qty 0 / > held.
**Expected Results:** 404 (ownership/no-position), 409 (disconnected), 422 (qty). Cross-user position close blocked (P0).

---
```yaml
id: TC-POS-001-005
title: Close-all own positions (include_subscribers=false); options LIMIT; per-position failure isolated
primary_func_id: POS-001
related_func_ids: [TRADE-002]
module: positions
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/positions.spec.ts (TC-POS-001-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, positions, recovery, destructive, requires-fake-broker, P1]
source_refs: [POST /api/positions/close-all?include_subscribers=false, backend/app/api/positions.py::close_all_positions (_option_close_limit; per-position failures collected)]
evidence_requirements: [All own positions reversed; options LIMIT; failures collected (not aborted); returns closed/failed counts]
```
**Steps:** 1) Multiple positions incl. one that will fail. 2) POST close-all (skip_fanout).
**Expected Results:** Successful positions closed; failures collected; response `{closed[], failed[], counts}`; a subscriber calling this closes only their own.

---
```yaml
id: TC-POS-001-006
title: Position aggregation correctness — no duplication/mis-sign across accounts; empty state
primary_func_id: POS-001
related_func_ids: []
module: positions
test_level: L2
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/positions.spec.ts (TC-POS-001-006)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, positions, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/positions.py::list_positions, backend/app/brokers/base.py::BrokerPosition]
evidence_requirements: [Long/short signed correctly; option OCC fields correct; no cross-account duplication; empty holdings → []]
```
**Steps:** 1) Mix long/short stocks + options across accounts; also a no-position case.
**Expected Results:** Correct signs/fields; no duplication; empty → `[]` (drives the UI empty state).

---
```yaml
id: TC-POS-001-007
title: Bulk-exit surfaces — My positions/orders (all roles); Subscribers positions/orders (trader-only, async)
primary_func_id: POS-001
related_func_ids: [TRADE-003, AUTHZ-001]
module: positions
test_level: L3
test_type: Permission
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/positions.spec.ts (TC-POS-001-007)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, positions, permission, destructive, requires-fake-broker, P1]
source_refs: [POST /api/positions/close-all-subscribers (require_trader), POST /api/trades/cancel-all-subscribers-open, frontend/components/BulkExitBar.tsx]
evidence_requirements: [My close-all works for any role; subscriber bulk-exit is trader-only (403 for subscriber) and async-queued (cross-ref TC-TRADE-003-001/002)]
```
**Steps:** 1) Subscriber attempts subscriber bulk-exit → 403. 2) Trader triggers subscriber bulk close/cancel.
**Expected Results:** Subscriber bulk-exit trader-only; queued async (see TC-TRADE-003-001/002); trader's own positions untouched by the subscriber sweep.
