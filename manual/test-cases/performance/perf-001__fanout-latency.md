# PERF-001 — Performance & fanout-latency reporting

Parent **PERF-001** (fanout performance view). Endpoints `GET /api/performance/fanouts` (trader) and
`GET /api/admin/performance/{fanouts,export,by-broker}` (admin). Source:
`backend/app/api/performance.py` (`list_fanouts`, `_serialize_fanout`, `realtime_fanout_clause`),
`backend/app/api/admin.py` (admin performance), `backend/app/models/order.py` (lifecycle timestamps),
`frontend/components/performance/PerformanceView.tsx`.

**Environment:** `[local-qa]` **BROKER_MODE=fake** (fanout data). Reads (non-destructive) except seeding fanouts. **Never production.**

---
```yaml
id: TC-PERF-001-001
title: Trader own fanout performance — metrics + per-fanout lifecycle lags
primary_func_id: PERF-001
related_func_ids: [COPY-001]
module: performance
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_perf_001_001_own_fanouts.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, performance, trader, destructive, requires-fake-broker, P2]
source_refs: [GET /api/performance/fanouts?limit (≤200), backend/app/api/performance.py::list_fanouts (parent fanouts; per-step lifecycle lags)]
evidence_requirements: [Returns {metrics:{fanouts_shown, avg_fanout_ms, max_fanout_ms, avg_total_ms}, fanouts:[children + per-step lags]}; own parents only]
```
**Steps:** 1) Trader generates fanouts (fake). 2) GET /api/performance/fanouts.
**Expected Results:** Metrics + per-fanout child lags returned; own parent orders only; newest-first.

---
```yaml
id: TC-PERF-001-002
title: Performance endpoints require trader (subscriber/admin → 403)
primary_func_id: PERF-001
related_func_ids: [AUTHZ-001]
module: performance
test_level: L2
test_type: Permission
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/performance/test_tc_perf_001_002_authz.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, performance, permission, P1]
source_refs: [GET /api/performance/fanouts (require_trader) — cross-ref TC-AUTHZ-001-012]
evidence_requirements: [Subscriber and admin → 403 trader_only on /api/performance/fanouts]
```
**Steps:** 1) Subscriber + admin call /api/performance/fanouts.
**Expected Results:** 403 `trader_only` (own-performance is trader-scoped; platform-wide perf is under /api/admin/*).

---
```yaml
id: TC-PERF-001-003
title: Realtime fanout clause excludes detection-lagged (>1h) parents
primary_func_id: PERF-001
related_func_ids: []
module: performance
test_level: L2
test_type: Data-Integrity
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_perf_001_003_realtime_clause.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, performance, data-integrity, destructive, requires-fake-broker, P2]
source_refs: [backend/app/api/performance.py::realtime_fanout_clause (excludes detection lag >1h so backfilled orders don't skew latency)]
evidence_requirements: [A parent with >1h detection lag (backfilled) is excluded from the realtime metrics/table]
```
**Steps:** 1) Seed a genuine realtime fanout + a backfilled one (>1h detection lag). 2) GET fanouts.
**Expected Results:** Backfilled/lagged parent excluded (metrics reflect realtime only) — prevents skewed latency (baseline perf memory).

---
```yaml
id: TC-PERF-001-004
title: Admin platform performance — fanouts, by-broker leaderboard, and export (admin-only)
primary_func_id: PERF-001
related_func_ids: [ADMIN-002]
module: performance
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/performance/test_tc_perf_001_004_admin_perf.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, performance, admin, P2]
source_refs: [GET /api/admin/performance/{fanouts,by-broker,export} (require_admin; _AGG_PARENT_CAP=2000; export commits inside GET), backend/app/api/admin.py]
evidence_requirements: [Admin-only (403 otherwise); by-broker sorted fastest-first; export returns .xlsx; parent cap 2000 with truncated flag]
```
**Steps:** 1) Non-admin → 403. 2) Admin GET fanouts/by-broker/export.
**Expected Results:** Admin platform metrics; by-broker leaderboard (median detection/broker/subscriber lags); xlsx export (commit inside GET); capped at 2000 parents with truncation flag.

---
```yaml
id: TC-PERF-001-005
title: Fanout metric correctness — avg/median/percent-within-1s computed from lifecycle timestamps
primary_func_id: PERF-001
related_func_ids: [COPY-001]
module: performance
test_level: L3
test_type: Data-Integrity
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_perf_001_005_metrics.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, performance, data-integrity, destructive, requires-fake-broker, P2]
source_refs: [backend/app/models/order.py (trader_submitted_at, socket_received_at, redis_published_at, subscriber_picked/accepted_at, broker_accepted_at, broker_call_ms)]
evidence_requirements: [avg_fanout_ms/median_platform_ms/median_broker_ms/pct_within_1s computed correctly from seeded lifecycle timestamps]
```
**Steps:** 1) Seed fanouts with known lifecycle timestamps. 2) Compare computed metrics to expected.
**Expected Results:** Metrics math correct (avg/median/percent-within-1s/success-rate) — reliable latency reporting for the fanout SLO.
