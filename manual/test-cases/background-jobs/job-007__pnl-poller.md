# JOB-007 — P&L poller & day-start equity

Parent **JOB-007** (P&L poller). Source: `backend/app/services/pnl_poller.py` (`start`, tick loop,
`_enforce_one`/`_enforce_one_safe`, `_has_active_policies`, `_interval_for_broker`, `_SNAPTRADE_SEM`),
`backend/app/services/day_start_equity.py`, `backend/app/services/platform_config.py`
(`alpaca_pnl_poll_interval_s`), `backend/app/main.py` (worker-only start), `backend/app/models/daily_equity_snapshot.py`.
Enforcement semantics (auto-pause/liq/position TP-SL) are covered by RISK-001/002/003 — referenced here.

**Environment:** `[local-qa]` worker + **BROKER_MODE=fake** with clock/P&L control. `@destructive` where it
mutates copy state/orders. **Never production.**

---
```yaml
id: TC-JOB-007-001
title: P&L poller starts only in the worker process (gated by run_background_workers)
primary_func_id: JOB-007
related_func_ids: [JOB-005]
module: background-jobs
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_007_001_poller_startup.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, worker, P1]
source_refs: [backend/app/services/pnl_poller.py::start, backend/app/main.py (run_background_workers gate)]
evidence_requirements: [Worker (run_background_workers=true) starts the poller; web tier (false) does NOT; single poller instance]
```
**Steps:** 1) Start worker + web tiers. 2) Inspect which process runs the poller.
**Expected Results:** Exactly one poller in the worker; none in web workers.

---
```yaml
id: TC-JOB-007-002
title: Poll interval + runtime override (Redis platform_config, bounds 5–300s)
primary_func_id: JOB-007
related_func_ids: [ADMIN-005]
module: background-jobs
test_level: L3
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_007_002_poll_interval.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, boundary, redis, P1]
source_refs: [backend/app/services/pnl_poller.py (_INTERVAL_BY_BROKER Alpaca 10s/SnapTrade 60s), platform_config.get_alpaca_pnl_poll_interval_s (setter 5–300)]
evidence_requirements: [Default Alpaca 10s / SnapTrade 60s; PATCH /api/admin/config/alpaca-pnl-poll-interval override in [5,300] takes effect; out-of-range → 422/clamped]
```
**Steps:** 1) Observe default cadence. 2) Admin override to 30 (valid) and 2/500 (invalid).
**Expected Results:** Cadence follows the effective value; setter rejects <5/>300; Redis override read on the hot path.

---
```yaml
id: TC-JOB-007-003
title: Poller processes each eligible account, skips disconnected, and skips idle (no-policy) accounts
primary_func_id: JOB-007
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
automation_ref: automation/integration/test_tc_job_007_003_per_account.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, destructive, requires-fake-broker, requires-seed, P1]
source_refs: [backend/app/services/pnl_poller.py (_has_active_policies skip-idle gate, per-account due-timers)]
evidence_requirements: [Each connected account with a policy is polled at its cadence; disconnected accounts skipped; accounts with no policy make NO broker call]
```
**Steps:** 1) Seed accounts: connected+policy, connected+no-policy, disconnected.
**Expected Results:** Only connected+policy accounts are polled; disconnected + no-policy skipped (no wasted broker calls).

---
```yaml
id: TC-JOB-007-004
title: One-account failure is crash-isolated and does not stop the others
primary_func_id: JOB-007
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
automation_status: Automated
automation_ref: automation/api/tests/jobs/background-jobs.spec.ts (TC-JOB-007-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, recovery, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/pnl_poller.py::_enforce_one_safe (per-account crash isolation)]
evidence_requirements: [A failing account's exception is isolated; all other accounts are still enforced in the same tick]
```
**Steps:** 1) One account's fake broker errors during enforce.
**Expected Results:** That account logged/skipped; every other account still enforced (no missed auto-liquidation/pause elsewhere). Missed-enforcement guard (P0).

---
```yaml
id: TC-JOB-007-005
title: Broker timeout / rate-limit during poll are handled (SnapTrade concurrency capped)
primary_func_id: JOB-007
related_func_ids: []
module: background-jobs
test_level: L3
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_007_005_broker_timeout_ratelimit.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/pnl_poller.py (_SNAPTRADE_SEM=4; snapshot failure → skip tick but still commit pending auto-resume)]
evidence_requirements: [Timeout/429 → tick skipped for that account, no crash; SnapTrade concurrent calls capped at 4]
```
**Steps:** 1) Fake broker timeout/429 during snapshot.
**Expected Results:** Tick skipped for that account; pending auto-resume still committed; SnapTrade calls throttled (sem=4).

---
```yaml
id: TC-JOB-007-006
title: Redis unavailable — poll interval override falls back to env default; poller continues
primary_func_id: JOB-007
related_func_ids: []
module: background-jobs
test_level: L3
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_007_006_redis_unavailable.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, redis, recovery, P1]
source_refs: [backend/app/services/platform_config.py (fall back to env on Redis error), redis_client.py graceful degradation]
evidence_requirements: [Redis down → poller uses env-default interval and keeps running (no crash)]
```
**Steps:** 1) Drop Redis. 2) Observe poller.
**Expected Results:** Override read falls to env default; poller continues enforcing from DB/broker; recovers when Redis returns.

---
```yaml
id: TC-JOB-007-007
title: Database contention — enforcement holds no DB session across the broker call
primary_func_id: JOB-007
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
automation_ref: automation/integration/test_tc_job_007_007_db_no_session_held.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/pnl_poller.py::_enforce_one (fetches snapshot with NO DB session held — pool-exhaustion fix)]
evidence_requirements: [During the broker snapshot call no DB connection is held; commit only when dirty; pool not exhausted under many accounts]
```
**Steps:** 1) Poll many accounts; monitor DB pool.
**Expected Results:** No session held during broker I/O; commits only when state changed; pool stays healthy (baseline pool-exhaustion fix).

---
```yaml
id: TC-JOB-007-008
title: Poller drives daily pause / auto-liquidation / position TP-SL enforcement across accounts
primary_func_id: JOB-007
related_func_ids: [RISK-001, RISK-002, RISK-003]
module: background-jobs
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/jobs/background-jobs.spec.ts (TC-JOB-007-008)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/pnl_poller.py::_enforce_one (daily limits, auto_liquidator, position_enforcer, reconcile_copy_brackets)]
evidence_requirements: [Poller ticks trigger the enforcement paths verified in RISK-001-007/008, RISK-002-002, RISK-003-004/005 — for accounts the trader isn't actively touching]
```
**Steps:** 1) Set up subscribers past their limits with the trader idle. 2) Let the poller tick.
**Expected Results:** Daily loss/profit pause, auto-liquidation, and position TP/SL fire from the **poller** (covers the "trader quiet but positions move" gap). Cross-ref RISK cases for semantics. Missed-pause/missed-liquidation guard (P0).

---
```yaml
id: TC-JOB-007-009
title: P&L tick SSE event is emitted after commit
primary_func_id: JOB-007
related_func_ids: [NOTIF-001]
module: background-jobs
test_level: L3
test_type: Integration
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_007_009_pnl_tick_sse.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, sse, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/pnl_poller.py (SSE pnl.tick / copy.auto_paused / copy.auto_liquidated after commit)]
evidence_requirements: [pnl.tick SSE delivered to the subscriber stream after the poller commits; lossy if Redis down]
```
**Steps:** 1) Open SSE. 2) Let the poller tick.
**Expected Results:** `pnl.tick` delivered post-commit (and `copy.auto_*` on state change).

---
```yaml
id: TC-JOB-007-010
title: Day-start equity snapshot creation, duplicate prevention, and ET trading-day boundary
primary_func_id: JOB-007
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
automation_status: Automated
automation_ref: automation/api/tests/jobs/background-jobs.spec.ts (TC-JOB-007-010)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/day_start_equity.py::get_or_record, backend/app/models/daily_equity_snapshot.py (uq_daily_equity_account_date)]
evidence_requirements: [First poll of a day records a day-start equity row; repeat polls do NOT duplicate (unique (account,utc_date)); boundary respects the intended day key]
```
**Steps:** 1) First poll of the day (broker lacks last_equity → fallback records equity). 2) Repeat polls same day. 3) Cross a day boundary.
**Expected Results:** One snapshot per (account, day); duplicate insert prevented by the unique constraint (idempotent under poller races); new day creates a new row.

---
```yaml
id: TC-JOB-007-011
title: Single-worker enforcement — only one poller runs even with multiple web workers
primary_func_id: JOB-007
related_func_ids: [JOB-005]
module: background-jobs
test_level: L3
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_007_011_single_poller.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, background-jobs, concurrency, destructive, requires-fake-broker, P0]
source_refs: [backend/app/main.py (background singletons gated), docker-compose.yml (never scale worker >1)]
evidence_requirements: [With N web workers + 1 worker, exactly one poller enforces each account once per tick — no duplicate auto-actions]
```
**Steps:** 1) Run multiple web workers + one worker. 2) Verify each account enforced once per tick.
**Expected Results:** One poller; no duplicate daily-pause/liquidation actions. Duplicate-financial-action guard (P0).
