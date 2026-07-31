# PNL-001 — Calendar & daily P&L

Parent **PNL-001**. Endpoint `GET /api/calendar/pnl`. Source: `backend/app/api/trades.py::calendar_pnl`,
`backend/app/services/pnl.py`, `backend/app/services/pnl_snapshot.py`, `backend/app/services/broker_pnl.py`,
`backend/app/services/fills_sync.py::sync_user_fills`, `frontend/app/(app)/calendar/page.tsx`.

**Environment:** `[local-qa]` **BROKER_MODE=fake**. `@destructive` (sync-fills + snapshot writes). **Never production.**

---
```yaml
id: TC-PNL-001-001
title: Calendar daily realized P&L for the current user (merges frozen snapshots + DB-derived)
primary_func_id: PNL-001
related_func_ids: [JOB-008]
module: pnl
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_pnl_001_001_calendar.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, pnl, destructive, requires-fake-broker, P1]
source_refs: [GET /api/calendar/pnl?from&to&tz, backend/app/api/trades.py::calendar_pnl]
evidence_requirements: [Per-day realized P&L; frozen snapshot wins over DB-derived; carries pct where present; days bucketed by tz (default ET)]
```
**Steps:** 1) Generate fills + snapshots. 2) GET calendar/pnl for a range.
**Expected Results:** Daily P&L returned; snapshot values take precedence over DB-derived; pct carried for Alpaca days.

---
```yaml
id: TC-PNL-001-002
title: Trader "view-as" a subscriber (?user_id) with authorization guards
primary_func_id: PNL-001
related_func_ids: [AUTHZ-001]
module: pnl
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/pnl/test_tc_pnl_001_002_view_as.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, pnl, permission, security, P1]
source_refs: [backend/app/api/trades.py::calendar_pnl (user_id: trader-only; 403 trader_only; 404 not_a_subscriber; mirrors_only for subscribers)]
evidence_requirements: [Non-trader with ?user_id → 403; trader viewing a non-follower → 404; trader viewing own subscriber → that subscriber's mirrors-only P&L]
```
**Steps:** 1) Subscriber passes ?user_id → 403. 2) Trader views a non-subscriber → 404. 3) Trader views own subscriber.
**Expected Results:** As annotated; subscriber P&L is mirrors-only.

---
```yaml
id: TC-PNL-001-003
title: Broker-basis differences are represented correctly (Alpaca marked $+% vs Webull/SnapTrade realized)
primary_func_id: PNL-001
related_func_ids: [JOB-008]
module: pnl
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_pnl_001_003_broker_basis.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, pnl, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/broker_pnl.py (SnapTrade FIFO realized), backend/app/brokers/alpaca.py::marked_pnl_by_day (marked + pct); baseline §16/§19 pnl_drift memory]
evidence_requirements: [Alpaca days carry marked P&L + pct; SnapTrade/Webull days carry realized P&L with pct NULL; tooltip basis matches]
```
**Steps:** 1) Set up an Alpaca subscriber and a SnapTrade subscriber. 2) Compare calendar values.
**Expected Results:** Alpaca = marked $+%; SnapTrade/Webull = realized-only (pct NULL). Documented mixed-basis presentation — confirm acceptable per §30 business question.

---
```yaml
id: TC-PNL-001-004
title: Calendar auto-syncs fills on load; a sync failure is non-fatal (stale P&L returned)
primary_func_id: PNL-001
related_func_ids: [JOB-008]
module: pnl
test_level: L3
test_type: Recovery
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_pnl_001_004_sync_nonfatal.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, pnl, recovery, destructive, requires-fake-broker, P2]
source_refs: [backend/app/api/trades.py::calendar_pnl (sync_user_fills first; failure → rollback, returns stale)]
evidence_requirements: [Sync-fills runs first; if it fails, the endpoint still returns (rolled back) stale P&L rather than erroring]
```
**Steps:** 1) Force sync-fills to fail. 2) GET calendar/pnl.
**Expected Results:** Endpoint returns 200 with existing P&L (sync failure non-fatal, rolled back).

---
```yaml
id: TC-PNL-001-005
title: Date-range and timezone validation
primary_func_id: PNL-001
related_func_ids: []
module: pnl
test_level: L2
test_type: Boundary
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/pnl/test_tc_pnl_001_005_validation.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, pnl, boundary, negative, P2]
source_refs: [backend/app/api/trades.py::calendar_pnl (from>to → 422; tz IANA default ET)]
evidence_requirements: [from>to → 422; missing from/to → 422; valid IANA tz buckets days accordingly; default ET]
```
**Steps (data-driven):** from>to; missing dates; custom tz.
**Expected Results:** 422 on invalid ranges; tz respected (default America/New_York).

---
```yaml
id: TC-PNL-001-006
title: Admin daily-P&L split (trader vs subscriber) with bounded live fill-in
primary_func_id: PNL-001
related_func_ids: [ADMIN-002]
module: pnl
test_level: L2
test_type: Data-Integrity
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/pnl/test_tc_pnl_001_006_admin_daily_pnl.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, pnl, admin, data-integrity, P2]
source_refs: [GET /api/admin/daily-pnl (LIVE_FILLIN_DAYS=3; role split; "today" via market_hours.now_et), backend/app/api/admin.py::admin_daily_pnl]
evidence_requirements: [Merges frozen snapshots + ≤3-day live fill-in; trader vs subscriber split; ET "today"; values as strings]
```
**Steps:** 1) Admin GET daily-pnl with role/user filters.
**Expected Results:** Newest-first per-day {trader_pnl, subscriber_pnl, total, users}; live fill-in bounded to 3 days; ET day boundary.
