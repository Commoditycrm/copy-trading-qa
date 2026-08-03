# JOB-001 / JOB-009 / JOB-013 — Recovery, EOD auto-close, retry scheduler

Parents: **JOB-001** (crash recovery), **JOB-009** (EOD 0DTE auto-close), **JOB-013** (retry scheduler).
Source: `backend/app/services/recovery.py`, `backend/app/services/eod_autoclose.py`,
`backend/app/services/retry_scheduler.py`, `backend/app/services/market_hours.py`, `backend/app/main.py`.
Recovery-of-listeners is covered by TC-JOB-005-004; EOD lockout/disabled by RISK-006-001/002; retry
max-attempts/final-rejection by COPY-003-003 — referenced here.

**Environment:** `[local-qa]` worker + **BROKER_MODE=fake** + clock control. `@destructive`. **Never production.**

---
```yaml
id: TC-JOB-001-002
title: Crash recovery must NOT duplicate order placement (idempotent client_order_id)
primary_func_id: JOB-001
related_func_ids: [COPY-001, JOB-005]
module: background-jobs
test_level: L3
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/jobs/background-jobs.spec.ts (TC-JOB-001-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, concurrency, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/recovery.py::sweep_orphaned_pending (client_order_id=child.id; 60s age gate avoids racing in-flight fanout)]
evidence_requirements: [If an order was actually placed before the crash, recovery does NOT place a second one (broker idempotency via client_order_id); age gate skips in-flight]
```
**Preconditions:** A child order that reached the broker but is still PENDING locally (crash before status update).
**Steps:** 1) Start worker → recovery sweep runs.
**Expected Results:** Recovery replays using `client_order_id=child.id` so the broker rejects/dedupes a duplicate; the 60s age gate avoids racing in-flight fanout. **No duplicate order placed.** Recovery-duplicate-order guard (P0). (Recovery of listeners → TC-JOB-005-004.)

---
```yaml
id: TC-JOB-009-001
title: EOD 0DTE auto-close execution — worker flattens same-day-expiry option positions in the window
primary_func_id: JOB-009
related_func_ids: [RISK-006]
module: background-jobs
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/jobs/background-jobs.spec.ts (TC-JOB-009-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/eod_autoclose.py::run_loop/_sweep_pairs (_CHECK_INTERVAL_S=15, _BULK_CONCURRENCY=4, per-account 60s timeout), gated eod_autoclose_enabled]
evidence_requirements: [In-window opted-in subscribers get ONLY 0DTE option positions flattened (marketable LIMIT); later-expiry + stocks untouched]
```
**Steps:** 1) Opted-in subscriber holds 0DTE + later-expiry option + stock; clock in the EOD window.
**Expected Results:** Only the 0DTE option flattened; later-expiry + stocks untouched; runs once per trading day (process-local guard); disabling `eod_autoclose_enabled` disables it (see RISK-006-001).

---
```yaml
id: TC-JOB-009-002
title: EOD market-hours behavior — weekday-only; no holiday/early-close calendar (documented limitation)
primary_func_id: JOB-009
related_func_ids: []
module: background-jobs
test_level: L3
test_type: Boundary
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_009_002_market_hours.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, boundary, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/market_hours.py (is_trading_weekday Mon–Fri; NO holiday/early-close calendar — baseline)]
evidence_requirements: [EOD sweep fires Mon–Fri; on a market holiday it still evaluates (no holiday calendar) but finds nothing/broker rejects late order — documented tolerance]
```
**Steps (clock-controlled):** weekday in-window → fires; weekend → does not; holiday → evaluates but no-op (documented).
**Expected Results:** Weekday-only gating; **no holiday/early-close awareness** (baseline limitation) — tolerated because a closed day = empty positions / broker rejects. Record as a known limitation.

---
```yaml
id: TC-JOB-009-003
title: EOD timezone handling uses America/New_York (DST-aware) for the window
primary_func_id: JOB-009
related_func_ids: []
module: background-jobs
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_009_003_timezone.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, boundary, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/market_hours.py (ET ZoneInfo, in_eod_close_window), eod_autoclose.py]
evidence_requirements: [Window computed in ET (DST-correct); a subscriber's minutes (1–30) window aligns to 16:00 ET close]
```
**Steps (clock-controlled across a DST boundary):** evaluate the window just before/after 16:00 ET.
**Expected Results:** Window `[close − minutes, 16:00 ET)` is DST-correct; fires only inside it.

---
```yaml
id: TC-JOB-009-004
title: EOD position close failure and partial auto-close are per-leg isolated
primary_func_id: JOB-009
related_func_ids: []
module: background-jobs
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_009_004_close_failure.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/eod_autoclose.py::_sweep_pairs (_BULK_CONCURRENCY=4, per-account 60s timeout, per-account isolation)]
evidence_requirements: [One account's close failure does not block others; a partial auto-close leaves the rest for the next tick / logs the failure]
```
**Steps:** 1) One account's fake broker fails the close; another succeeds.
**Expected Results:** Failure isolated per account; partial close logged; successful accounts flattened; worker restart re-runs safely (second sweep finds nothing).

---
```yaml
id: TC-JOB-013-001
title: Retry scheduler heartbeat is exposed and healthy within 3 poll intervals
primary_func_id: JOB-013
related_func_ids: [COPY-003]
module: background-jobs
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/background/test_tc_job_013_001_retry_heartbeat.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, background-jobs, P1]
source_refs: [backend/app/services/retry_scheduler.py::heartbeat_status (poll 10s), GET /api/health]
evidence_requirements: [Health/heartbeat reports healthy while the scheduler ticks (within 3× poll interval); stale heartbeat detectable]
```
**Steps:** 1) GET /api/health while the scheduler runs. 2) Stop the scheduler and re-check.
**Expected Results:** Heartbeat healthy within 3 poll intervals when running; goes stale when stopped (stale-heartbeat detection). Metrics/health visibility.

---
```yaml
id: TC-JOB-013-002
title: Retry scheduler restart recovery — resumes processing RETRY_PENDING orders after a worker restart
primary_func_id: JOB-013
related_func_ids: [COPY-003]
module: background-jobs
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/jobs/background-jobs.spec.ts (TC-JOB-013-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/retry_scheduler.py::poll_loop (RETRY_PENDING AND retry_at<=now, ordered by retry_at)]
evidence_requirements: [After a worker restart, due RETRY_PENDING orders are picked up and processed; re-checks gates before re-placing]
```
**Steps:** 1) Leave RETRY_PENDING orders due. 2) Restart the worker.
**Expected Results:** Scheduler resumes, re-checks gates (copy enabled, following, daily loss, interval), and re-places or rejects. Max-attempts/final-rejection+notification behavior → TC-COPY-003-003.
