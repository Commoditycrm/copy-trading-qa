# JOB-010 / JOB-011 / JOB-012 / ADMIN-006 — Reconcilers

Parents: **JOB-010** (close reconciler), **JOB-011** (Alpaca subscriber reconciler), **JOB-012** (SnapTrade
subscriber reconciler), **ADMIN-006** (on-demand position reconcile). Source:
`backend/app/services/close_reconciler.py`, `backend/app/services/alpaca_subscriber_reconciler.py`,
`backend/app/services/snaptrade_listener.py` (`_run_subscriber_reconciler`),
`backend/app/services/position_reconciler.py`, `backend/app/api/admin.py::reconcile_positions`,
`backend/app/config.py` (`close_reconcile_enabled`/`_apply`/`_interval_s`), `backend/app/services/market_hours.py`.

**Environment:** `[local-qa]` worker + **BROKER_MODE=fake** + clock control. `@destructive` where it flattens. **Never production.**

---
```yaml
id: TC-JOB-010-001
title: Close reconciler disabled by default (master switch off → whole loop no-ops)
primary_func_id: JOB-010
related_func_ids: []
module: background-jobs
test_level: L3
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_010_001_disabled.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, P1]
source_refs: [backend/app/services/close_reconciler.py::run_loop (close_reconcile_enabled default False → no-op)]
evidence_requirements: [With close_reconcile_enabled=false, the loop performs no reads/flattens]
```
**Steps:** 1) Default config. 2) Create a trader-exited-but-sub-held position.
**Expected Results:** Reconciler is a no-op (default off); nothing flattened.

---
```yaml
id: TC-JOB-010-002
title: Close reconciler dry-run — logs what it WOULD flatten but places no orders
primary_func_id: JOB-010
related_func_ids: []
module: background-jobs
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_010_002_dry_run.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/close_reconciler.py (close_reconcile_enabled=true, close_reconcile_apply=false → log-only)]
evidence_requirements: [Enabled + apply=false → logs candidate flattens; NO close orders placed]
```
**Steps:** 1) enabled=true, apply=false; only during regular session (ET). 2) Set up a stranded position.
**Expected Results:** Candidate logged; no order placed (dry-run first, like position_reconciler).

---
```yaml
id: TC-JOB-010-003
title: Close reconciler apply mode flattens positions the trader exited but the subscriber still holds
primary_func_id: JOB-010
related_func_ids: [COPY-002]
module: background-jobs
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_010_003_apply.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/close_reconciler.py::_tick (regular session only; _trader_held_keys ground truth; _sub_copied_keys)]
evidence_requirements: [apply=true: flattens ONLY contracts the sub holds + trader doesn't + we have a copied mirror for; not double-closing]
```
**Steps:** 1) enabled=true, apply=true, in regular session. 2) Trader exits; subscriber still holds a copied contract.
**Expected Results:** Reconciler flattens the stranded subscriber position (marketable LIMIT for options); only copied contracts; no double-close of already-closing positions. Double-close avoidance (P0).

---
```yaml
id: TC-JOB-010-004
title: Divergence detection — missing position, extra broker position, partial mismatch
primary_func_id: JOB-010
related_func_ids: [ADMIN-006]
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
automation_ref: automation/integration/test_tc_job_010_004_divergence.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/close_reconciler.py, position_reconciler.py (net vs broker drift)]
evidence_requirements: [Missing (sub flat, mirror says held), extra (broker holds unexpected), and partial-qty mismatches are each detected/classified]
```
**Steps (data-driven):** 1) sub flat but mirror open. 2) broker holds extra. 3) partial qty mismatch.
**Expected Results:** Each divergence detected and classified; only the trader-exited class is flattened (close reconciler), others reported.

---
```yaml
id: TC-JOB-010-005
title: Reconciler idempotency + safety — skips a subscriber on any incomplete/unreadable data
primary_func_id: JOB-010
related_func_ids: []
module: background-jobs
test_level: L3
test_type: Recovery
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_010_005_idempotency_safety.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, recovery, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/close_reconciler.py (_trader_held_keys returns None on ANY failure → skip subscriber)]
evidence_requirements: [If trader positions can't be read (no account/broker error), the subscriber is SKIPPED — never flattened on incomplete data; repeated ticks are idempotent]
```
**Steps:** 1) Make trader positions unreadable. 2) Run repeated ticks.
**Expected Results:** Subscriber skipped (never flatten on incomplete ground truth); a second tick after a partial flatten does not re-flatten already-closed. Never-flatten-on-bad-data guard (P0).

---
```yaml
id: TC-JOB-010-006
title: Worker crash during reconciliation resumes safely on the next tick / after transient failure
primary_func_id: JOB-010
related_func_ids: [JOB-005]
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
automation_ref: automation/integration/test_tc_job_010_006_crash_resume.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/close_reconciler.py (per-tick; no partial state persisted), main.py restart]
evidence_requirements: [A crash mid-reconcile leaves no corrupt state; next tick / worker restart re-evaluates from live data]
```
**Steps:** 1) Kill the worker mid-reconcile. 2) Restart.
**Expected Results:** No half-applied corruption; the loop re-derives from live positions and resumes; transient failure → next tick retries.

---
```yaml
id: TC-JOB-011-001
title: Alpaca subscriber reconciler refreshes mirror-order status only (never runs the activities feed)
primary_func_id: JOB-011
related_func_ids: [COPY-001]
module: background-jobs
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_011_001_alpaca_sub_reconciler.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/alpaca_subscriber_reconciler.py (_reconcile_once every 30s; fills_sync._refresh_open_orders status-only, no activities feed)]
evidence_requirements: [Working Alpaca subscriber mirror orders get status refreshed every ~30s; NO synthetic orders created (activities feed not run)]
```
**Steps:** 1) Alpaca subscriber holds a working mirror. 2) Wait ~30s.
**Expected Results:** Mirror status refreshed (WORKING→FILLED/CANCELED) enabling close-detection/history; no synthetic orders (activities feed not invoked). Fills the no-listener gap for plain Alpaca subscribers.

---
```yaml
id: TC-JOB-012-001
title: SnapTrade subscriber reconciler syncs mirror fills with a phantom-short recovery guard
primary_func_id: JOB-012
related_func_ids: [COPY-002]
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
automation_ref: automation/integration/test_tc_job_012_001_snaptrade_sub_reconciler.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/snaptrade_listener.py::_run_subscriber_reconciler / _persist_subscriber_fill (recovery guard; never flip when broker unreachable)]
evidence_requirements: [CANCELED→FILLED flip only when it moves net toward broker-held net without overshoot; never when broker unreachable (reachable=False)]
```
**Steps:** 1) SnapTrade subscriber with a working mirror; broker later reports filled. 2) Also test broker-unreachable.
**Expected Results:** Fill recovered only toward broker-held net without overshoot; broker unreachable → no flip (protects against phantom-short regression).

---
```yaml
id: TC-ADMIN-006-001
title: On-demand position reconcile (admin) — dry-run default; apply writes synthetic closes
primary_func_id: ADMIN-006
related_func_ids: [AUTHZ-001]
module: background-jobs
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/background/test_tc_admin_006_001_reconcile.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, background-jobs, admin, destructive, requires-fake-broker, P1]
source_refs: [POST /api/admin/positions/reconcile, backend/app/services/position_reconciler.py (apply default False; empty-broker guard)]
evidence_requirements: [require_admin (403 otherwise); apply=false writes nothing; apply=true writes AUTO_EXPIRED_WORTHLESS synthetic closes tagged RECONCILE:; empty-broker guard skips accounts returning []]
```
**Steps:** 1) Non-admin → 403. 2) Admin dry-run (apply=false). 3) Admin apply=true on a diverged account.
**Expected Results:** 403 for non-admin; dry-run reports only; apply writes synthetic closes + logs admin email; empty-broker (broker returns [] but we hold) skipped (SnapTrade 404 swallow guard).
