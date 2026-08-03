# COPY-003 — Mirror order retry & rejection

Parent: **COPY-003**, workflow **WF-12**. Source: `backend/app/services/retry_scheduler.py`
(`poll_loop`, `_retry_one_order`, `_passes_gates`), `backend/app/services/order_retry.py`
(`classify_error`, `place_order_with_recovery`), `backend/app/services/copy_engine.py` (Phase-3 error
routing), `backend/app/services/notifications.py`.

**Environment:** `[local-qa]` with **BROKER_MODE=fake** (error/latency profiles). `@destructive`.

---
```yaml
id: TC-COPY-003-001
title: Transient broker error routes the mirror to RETRY_PENDING with a future retry_at
primary_func_id: COPY-003
related_func_ids: [COPY-001]
module: copy-engine
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/broker-lifecycle.spec.ts (TC-COPY-003-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (Phase 3), order_retry.classify_error]
evidence_requirements: [Mirror status RETRY_PENDING; retry_at in the future; subscriber opted in to retry]
```
**Preconditions:** Subscriber with a retry policy (interval≠NEVER, attempts≥1); fake broker returns a transient (5xx-like) error.
**Steps:** 1) Trader order fans out; the subscriber's mirror hits a transient error.
**Expected Results:** Mirror → `RETRY_PENDING`, `retry_at` set (now + interval), no broker id; not rejected.

---
```yaml
id: TC-COPY-003-002
title: Retry scheduler re-places a RETRY_PENDING order and it succeeds (SUBMITTED)
primary_func_id: COPY-003
related_func_ids: [JOB-013]
module: copy-engine
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/broker-lifecycle.spec.ts (TC-COPY-003-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/retry_scheduler.py::_retry_one_order]
evidence_requirements: [After retry_at elapses and broker recovers, order → SUBMITTED; retry_count incremented]
```
**Steps:** 1) Order is RETRY_PENDING. 2) Fake broker recovers. 3) Wait for the scheduler tick past retry_at.
**Expected Results:** Order re-placed → SUBMITTED; `retry_count` incremented.

---
```yaml
id: TC-COPY-003-003
title: Retry exhaustion — after max attempts the order is REJECTED and the subscriber is notified
primary_func_id: COPY-003
related_func_ids: [NOTIF-001, SMS-001]
module: copy-engine
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/jobs/background-jobs.spec.ts (TC-COPY-003-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, recovery, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/retry_scheduler.py (retry_count ≥ retry_max_attempts → REJECTED + _notify_retry_failed)]
evidence_requirements: [Order REJECTED after retry_max_attempts; notification created (in-app; SMS only if opted-in category)]
```
**Preconditions:** `retry_max_attempts` small (e.g. 1–2); fake broker keeps failing transiently.
**Steps:** 1) Let the order retry until attempts are exhausted.
**Expected Results:** Final status REJECTED; `_notify_retry_failed` in-app notification (SMS only for the registered A2P category if enabled).

---
```yaml
id: TC-COPY-003-004
title: User-fixable error is a clean REJECTED (no retry) with a friendly reason
primary_func_id: COPY-003
related_func_ids: []
module: copy-engine
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/broker-lifecycle.spec.ts (TC-COPY-003-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/order_retry.py::classify_error (user-fixable table)]
evidence_requirements: [Order REJECTED immediately with friendly_message; no RETRY_PENDING]
```
**Preconditions:** Fake broker returns a user-fixable error (e.g. insufficient buying power shape).
**Steps:** 1) Fan out.
**Expected Results:** Mirror REJECTED with a clean friendly reason; not retried.

---
```yaml
id: TC-COPY-003-005
title: Retry gates — copy disabled between attempts skips the retry (retry_skipped)
primary_func_id: COPY-003
related_func_ids: [RISK-001]
module: copy-engine
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_003_005_retry_gate_copy_off.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/retry_scheduler.py::_passes_gates]
evidence_requirements: [If copy_enabled flips false (or daily loss hit) before retry, order → REJECTED retry_skipped:<reason>]
```
**Steps:** 1) Order RETRY_PENDING. 2) Disable subscriber copy (or trip daily loss limit). 3) Scheduler tick.
**Expected Results:** Retry skipped; order REJECTED `retry_skipped:<reason>` — a paused subscriber is not force-retried.

---
```yaml
id: TC-COPY-003-006
title: Retry interval NEVER — transient error rejects immediately, no retry scheduled
primary_func_id: COPY-003
related_func_ids: []
module: copy-engine
test_level: L2
test_type: Boundary
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_003_006_retry_never.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, boundary, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/copy_engine.py (retry only if opted-in), retry_scheduler _passes_gates (interval NEVER)]
evidence_requirements: [Subscriber with retry_interval=NEVER → transient error → REJECTED, no RETRY_PENDING]
```
**Steps:** 1) Subscriber retry policy NEVER. 2) Transient broker error on fanout.
**Expected Results:** Mirror REJECTED immediately; no retry row scheduled.

---
```yaml
id: TC-COPY-003-007
title: Retried CLOSE keeps close semantics — Potential defect (is_closing reset on transient retry)
primary_func_id: COPY-003
related_func_ids: [COPY-002]
module: copy-engine
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
defect_status: Potential
automation_candidate: true
automation_status: Automated (DEFECT CONFIRM — documents current behavior)
automation_ref: automation/api/tests/trading/positions-close.spec.ts (TC-COPY-003-007)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py:2510 (is_closing=False on transient retry — TODO), baseline §27]
evidence_requirements: [A copied CLOSE that hits a transient error and retries should preserve is_closing and use retry_interval_close]
```
**Steps:** 1) Trader closes a position → subscriber mirror close hits a transient error → RETRY_PENDING. 2) Observe retry.
**Expected Results (intended):** retry preserves close semantics and uses `retry_interval_close`.
**Known/Potential defect (baseline §27):** `is_closing` may be reset to false on transient retry (mis-classified as open). `defect_status: Potential` — **do NOT file yet**; reproduce **twice** in QA before filing (DEFECT_MANAGEMENT_PROCESS §7); if not reproduced/env-caused, classify and update Expected Result + VERIFICATION_NOTES.
```
