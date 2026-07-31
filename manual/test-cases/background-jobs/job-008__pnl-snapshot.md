# JOB-008 — Realized P&L snapshot job

Parent **JOB-008**. Source: `backend/app/services/pnl_snapshot.py` (`_run_loop` 3600s, `run_snapshot_sweep`,
`_fill_lagging_gap_days`), `backend/app/services/broker_pnl.py`, `backend/app/services/fills_sync.py`,
`backend/app/models/daily_realized_pnl_snapshot.py` (uq_daily_realized_pnl_user_day),
`backend/app/services/market_hours.py` (ET). Started idempotently (main.py + tail of start_all_listeners).

**Environment:** `[local-qa]` worker + **BROKER_MODE=fake**. `@destructive` (writes snapshot rows). **Never production.**

---
```yaml
id: TC-JOB-008-001
title: Realized P&L snapshot persistence (broker-direct, ET days, idempotent upsert)
primary_func_id: JOB-008
related_func_ids: [PNL-001]
module: background-jobs
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_008_001_snapshot_persistence.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/pnl_snapshot.py::run_snapshot_sweep (35-day window), broker_pnl.realized_by_day_from_broker, model uq_daily_realized_pnl_user_day]
evidence_requirements: [Per-user/per-day realized_pnl rows persisted using ET day keys; unique (user_id, day); pct column set for Alpaca, NULL for SnapTrade]
```
**Steps:** 1) Run the snapshot sweep over connected accounts with fake activity.
**Expected Results:** One row per (user, day); idempotent upsert; Alpaca marked pct set, SnapTrade/Webull pct NULL; per-account session/commit isolation.

---
```yaml
id: TC-JOB-008-002
title: Snapshot update & freeze — durable lag fallback is not overwritten by a later broker $0
primary_func_id: JOB-008
related_func_ids: []
module: background-jobs
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_008_002_freeze_behavior.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/pnl_snapshot.py::_fill_lagging_gap_days (traders only, LAG_FALLBACK_DAYS=4; conditional upsert where source != db_fallback_lag)]
evidence_requirements: [A db_fallback_lag row (feed-silent day) is NOT overwritten by a later broker $0; subscribers stay broker-authoritative]
```
**Steps:** 1) Create a feed-silent trader day (fallback from own filled orders). 2) Later broker returns $0 for that day.
**Expected Results:** The durable `db_fallback_lag` value survives (conditional upsert); subscribers remain broker-authoritative (no re-dated phantoms).

---
```yaml
id: TC-JOB-008-003
title: Fill-synchronization interaction — snapshot reconciles with synced fills without double-counting
primary_func_id: JOB-008
related_func_ids: [PNL-001]
module: background-jobs
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_008_003_fill_sync_interaction.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/fills_sync.py (dedup by broker_fill_id, recompute filled qty from Fill rows), pnl_snapshot.py]
evidence_requirements: [Snapshot realized P&L reconciles with deduped fills; no double-count when fills sync overlaps the snapshot window]
```
**Steps:** 1) Sync fills then run snapshot on overlapping activity.
**Expected Results:** Realized P&L consistent; fills deduped by `broker_fill_id`; Calendar (PNL-001) reads frozen snapshot over DB fallback.
