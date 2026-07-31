# HIST-001 / EXPORT-001 — Trades history, filters, pagination & exports

Parents **HIST-001** (order history) and **EXPORT-001** (Excel export). Endpoints `/api/trades`,
`/api/trades/page`, `/api/trades/stats`, `/api/trades/export`, `/api/trades/export/count`,
`/api/trades/{id}`. Source: `backend/app/api/trades.py`, `backend/app/services/trade_filters.py`,
`backend/app/services/excel_export.py`, `frontend/app/(app)/trades/page.tsx`.

**Environment:** `[local-qa, qa]` (API + DB; export downloads). Non-destructive (reads). **Never production.**

---
```yaml
id: TC-HIST-001-001
title: List trades (own) — date range as ET market days, limit
primary_func_id: HIST-001
related_func_ids: []
module: history
test_level: L2
test_type: Functional
priority: P1
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/history/test_tc_hist_001_001_list.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, history, P1]
source_refs: [GET /api/trades?from&to&limit (≤1000), backend/app/api/trades.py::list_trades (COALESCE(submitted_at,created_at) desc; transient realized_pnl)]
evidence_requirements: [Own orders newest-first; from/to interpreted as ET market days; limit ≤1000; each row carries FIFO realized_pnl]
```
**Steps:** 1) GET /api/trades with a date range + limit.
**Expected Results:** Own orders only, newest-first, ET day range; realized P&L attached.

---
```yaml
id: TC-HIST-001-002
title: Paged trades — status tabs, symbol search, sort whitelist, direction, limit/offset
primary_func_id: HIST-001
related_func_ids: []
module: history
test_level: L2
test_type: Functional
priority: P1
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/history/test_tc_hist_001_002_paged.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, history, P1]
source_refs: [GET /api/trades/page (status alias, search, sort whitelist, dir asc|desc, limit 1–200, offset), backend/app/services/trade_filters.py]
evidence_requirements: [Page{items,total,limit,offset}; status tabs (all/working/filled/cancelled/rejected); symbol search; sort whitelist (unknown→submitted); dead bracket legs excluded]
```
**Steps (data-driven):** each status tab; search a symbol; sort by whitelisted + unknown field; page through.
**Expected Results:** Correct filtered/sorted page + total; unknown sort falls back; resting bracket legs excluded unless FILLED.

---
```yaml
id: TC-HIST-001-003
title: Trades stats — all vs mine scopes (cached), excludes resting bracket legs
primary_func_id: HIST-001
related_func_ids: []
module: history
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/history/test_tc_hist_001_003_stats.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, history, P2]
source_refs: [GET /api/trades/stats (cached 15s), backend/app/api/trades.py::trades_stats]
evidence_requirements: [Returns all + mine (trader non-fanned-out) scopes; excludes resting bracket legs unless FILLED; cached ~15s]
```
**Steps:** 1) GET stats.
**Expected Results:** Accurate all/mine counts; resting legs excluded; cached.

---
```yaml
id: TC-HIST-001-004
title: Get one trade — owner-only (404 otherwise)
primary_func_id: HIST-001
related_func_ids: [AUTHZ-001]
module: history
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/history/test_tc_hist_001_004_get_one.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, history, permission, security, P1]
source_refs: [GET /api/trades/{order_id} (owner → 404 for non-owner)]
evidence_requirements: [Own order → 200 OrderOut with fills; another user's order id → 404 (existence hidden)]
```
**Steps:** 1) GET own order. 2) GET another user's order id.
**Expected Results:** 200 (own) / 404 (foreign — no cross-user leak).

---
```yaml
id: TC-HIST-001-005
title: Fills rendered as sub-rows; frozen "submitted" order row; realized P&L transient
primary_func_id: HIST-001
related_func_ids: [PNL-001]
module: history
test_level: L2
test_type: Data-Integrity
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/history/test_tc_hist_001_005_fills.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, history, data-integrity, P2]
source_refs: [backend/app/schemas/order.py::OrderOut (fills nested; realized_pnl computed), frontend/app/(app)/trades/page.tsx]
evidence_requirements: [Fills nested under the order; realized_pnl computed transiently (FIFO); filled_quantity ≤ quantity]
```
**Steps:** 1) GET a partially/fully filled order.
**Expected Results:** Fills present and summed correctly (no double-count); realized P&L transient; qty invariant holds.

---
```yaml
id: TC-EXPORT-001-001
title: Export trades to Excel — filters, limit, ROW_CAP, GET-with-commit
primary_func_id: EXPORT-001
related_func_ids: [HIST-001]
module: history
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/history/test_tc_export_001_001_export.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, history, export, P2]
source_refs: [GET /api/trades/export (from/to/status/search/limit≤ROW_CAP), backend/app/services/excel_export.py (ROW_CAP=20000; ET timestamps), backend/app/api/trades.py::export_trades (db.commit inside GET)]
evidence_requirements: [Returns .xlsx attachment; filters applied; ROW_CAP=20000 truncation disclosed; timestamps ET; commits inside GET (not idempotent — documented)]
```
**Steps:** 1) Export with filters + limit; export >20k rows.
**Expected Results:** Valid xlsx (Content-Disposition filename); ET timestamps; >20k truncated with disclosure; note GET performs a commit (brokerage-name healing/audit).

---
```yaml
id: TC-EXPORT-001-002
title: Export for another user is admin-only (403 for non-admin); audit distinguishes actor vs subject
primary_func_id: EXPORT-001
related_func_ids: [AUTHZ-001]
module: history
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/history/test_tc_export_001_002_admin_export.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, history, export, permission, security, P0]
source_refs: [backend/app/api/trades.py::export_trades (user_id ADMIN ONLY → 403 admin_only; audit trades.exported vs trades.exported_other)]
evidence_requirements: [Non-admin passing another user_id → 403; admin → export of that user; audit records actor vs subject correctly]
```
**Steps:** 1) Non-admin exports with `?user_id=` of another user → 403. 2) Admin exports another user's trades.
**Expected Results:** 403 for non-admin; admin allowed; audit `trades.exported`/`trades.exported_other`. Cross-user data export blocked (P0).

---
```yaml
id: TC-EXPORT-001-003
title: Export count and no-secret / OCC-safe cell formatting
primary_func_id: EXPORT-001
related_func_ids: [SEC-001]
module: history
test_level: L2
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/history/test_tc_export_001_003_count_format.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, history, export, data-integrity, security, P1]
source_refs: [GET /api/trades/export/count (same auth+filters), backend/app/services/excel_export.py (typed cells; no secret columns)]
evidence_requirements: [export/count matches export rows under the same filters (admin-for-other → 403); export contains no credentials; OCC option symbols kept as text (not scientific notation)]
```
**Steps:** 1) GET export/count vs export row count. 2) Inspect an exported option row.
**Expected Results:** Counts consistent; same admin authZ; no secret columns; OCC symbols rendered as text (typed cells) — Money fmt correct.
