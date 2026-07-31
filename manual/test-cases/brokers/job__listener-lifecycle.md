# Broker listener lifecycle (Stage 6)

Primary IDs: **JOB-005** (listener_control), **JOB-006** (listener reconciler), **JOB-001** (crash
recovery), **JOB-002/003** (Alpaca/SnapTrade listeners), **ADMIN-002** (admin listener-health),
**COPY-001** (historical replay guard), **TRADE-001** (app-originated marker). Source:
`backend/app/main.py` (web/worker split startup), `backend/app/services/listener_control.py`,
`backend/app/services/listeners.py` (`run_reconciler`, `reconcile_once`, `start_all_listeners`),
`backend/app/services/listener_state.py`, `backend/app/services/recovery.py`,
`backend/app/services/trade_listener.py` / `snaptrade_listener.py`, `backend/app/services/order_intent.py`,
`backend/app/services/copy_engine.py::order_predates_connection`, `docker-compose.yml`.

**Environment:** `[local-qa]` **BROKER_MODE=fake** with the web/worker split + Redis. `@destructive` where
listeners/orders are affected. **Never production.**

---
```yaml
id: TC-JOB-005-001
title: Listener starts after a trader broker connection (web publishes listener:control, worker consumes)
primary_func_id: JOB-005
related_func_ids: [BRK-001, JOB-002]
module: brokers
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_005_001_start_on_connect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, redis, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/listener_control.py (request_start publish; run_subscriber consume), backend/app/main.py (worker startup)]
evidence_requirements: [Trader connect → Redis publish on listener:control; worker consumes and starts the listener; listener_state connected]
```
**Steps:** 1) Trader connects a fake broker (web tier). 2) Inspect Redis `listener:control` + worker.
**Expected Results:** Web publishes a start request; worker consumes it and starts the listener off-loop (via to_thread); `listener_state` shows connected.

---
```yaml
id: TC-JOB-005-002
title: The web container never starts listeners directly (only requests via Redis)
primary_func_id: JOB-005
related_func_ids: [COPY-001]
module: brokers
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_005_002_web_no_direct_start.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, destructive, requires-fake-broker, P0]
source_refs: [backend/app/main.py (RUN_BACKGROUND_WORKERS=false in web tier skips listeners), listener_control.request_start]
evidence_requirements: [With RUN_BACKGROUND_WORKERS=false, the web process starts NO listeners itself; it only publishes control requests]
```
**Steps:** 1) Connect a broker on the web tier (workers disabled). 2) Verify no listener runs in the web process.
**Expected Results:** Web tier starts no listener (only the worker does) — prevents duplicate listeners across multiple web workers. Duplicate-listener prevention (P0).

---
```yaml
id: TC-JOB-006-001
title: Reconciler starts a missing desired listener (control-message-miss safety net)
primary_func_id: JOB-006
related_func_ids: [JOB-005]
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_006_001_reconciler_starts_missing.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/listeners.py::run_reconciler / reconcile_once (every 10s; note config listener_reconcile_interval_s=15 is unused — baseline §27)]
evidence_requirements: [A connected trader broker with no running listener gets one started within ~10s by the reconciler]
```
**Steps:** 1) Connect a trader broker but drop/miss the control message (simulate Redis blip). 2) Wait for a reconciler tick.
**Expected Results:** Reconciler derives desired listeners from the DB and starts the missing one within ~10s. **Note:** `LISTENER_RECONCILE_INTERVAL_S=15` is configured but not wired (runs at 10s) — baseline §27; verify actual cadence.

---
```yaml
id: TC-JOB-006-002
title: Duplicate listener prevention — the reconciler does not start a second listener for the same broker
primary_func_id: JOB-006
related_func_ids: [JOB-005, COPY-001]
module: brokers
test_level: L3
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_006_002_duplicate_prevention.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, concurrency, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/listeners.py::reconcile_once (idempotent; starts only missing), snaptrade finish listener-guard note (baseline)]
evidence_requirements: [Exactly ONE listener per (trader, account); no duplicate even under repeated connects / reconciler ticks / SnapTrade finish]
```
**Steps:** 1) Connect + repeated reconciler ticks + a SnapTrade finish. 2) Count running listeners for the trader.
**Expected Results:** Exactly one listener; duplicates prevented. **Cross-ref BRK-002-003:** SnapTrade finish starts a listener without the worker guard — capture whether a duplicate appears (Potential, reproduce twice before filing). Duplicate-listener/double-fanout guard (P0).

---
```yaml
id: TC-JOB-005-003
title: Listener stops after broker disconnect
primary_func_id: JOB-005
related_func_ids: [BRK-001]
module: brokers
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_005_003_stop_on_disconnect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/listener_control.py (request_stop; _dispatch stop off-loop to avoid deadlock), listeners.stop_listener]
evidence_requirements: [Disconnect → stop requested; worker stops the listener off-loop; listener_state cleared]
```
**Steps:** 1) Disconnect the trader's broker.
**Expected Results:** Stop requested via control channel; worker stops the listener (off-loop to avoid the run_coroutine_threadsafe deadlock); state cleared.

---
```yaml
id: TC-JOB-005-004
title: Listeners self-heal after a worker restart (re-derived from DB)
primary_func_id: JOB-005
related_func_ids: [JOB-006]
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_005_004_worker_restart.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/listeners.py::start_all_listeners (on worker startup), run_reconciler]
evidence_requirements: [After a worker restart, all active traders' listeners are restarted from the DB desired-state]
```
**Steps:** 1) Restart the worker container.
**Expected Results:** `start_all_listeners` + reconciler re-establish every connected trader's listener; no manual intervention.

---
```yaml
id: TC-JOB-001-001
title: Crash recovery — orphaned PENDING child orders are replayed on startup
primary_func_id: JOB-001
related_func_ids: [COPY-001]
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_001_001_crash_recovery.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/recovery.py::sweep_orphaned_pending (age 60s, batch 500, client_order_id=child.id idempotency)]
evidence_requirements: [Child orders stranded PENDING by a crash (>60s) are replayed once on next worker startup; idempotent via client_order_id]
```
**Preconditions:** Seed a child order stuck PENDING (>60s) as if a crash occurred mid-fanout.
**Steps:** 1) Start the worker.
**Expected Results:** Recovery sweep replays the orphaned PENDING order once (idempotent via `client_order_id=child.id`); audit `copy.recovered`; never fatal.

---
```yaml
id: TC-JOB-005-005
title: Worker singleton — multiple web workers must not duplicate listeners
primary_func_id: JOB-005
related_func_ids: [COPY-001]
module: brokers
test_level: L3
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_005_005_singleton.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, concurrency, destructive, requires-fake-broker, P0]
source_refs: [backend/app/main.py (background singletons gated on run_background_workers), docker-compose.yml (never scale worker >1; web workers RUN_BACKGROUND_WORKERS=false)]
evidence_requirements: [With N web workers + 1 worker, exactly one listener per trader broker; scaling web workers does not duplicate listeners or double-process fills]
```
**Steps:** 1) Run multiple uvicorn web workers + one worker. 2) Count listeners + verify each fill processed once.
**Expected Results:** Single worker owns all listeners; web workers spawn none; no duplicated broker calls / double-processed fills. Double-fanout/duplicate guard (P0).

---
```yaml
id: TC-JOB-005-006
title: Redis outage — control channel lost but listeners self-heal; PostgreSQL remains canonical
primary_func_id: JOB-005
related_func_ids: [JOB-006]
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_005_006_redis_outage.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, redis, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/listener_control.py (best-effort; reconciler + start_all re-derive from DB), backend/app/services/redis_client.py (graceful degradation), backend/app/services/events.py (lossy SSE)]
evidence_requirements: [Redis down: a missed control message is recovered by the DB-driven reconciler; caches fall to DB; SSE becomes a no-op; no data loss]
```
**Steps:** 1) Drop Redis during a connect. 2) Restore Redis.
**Expected Results:** Missed control message is healed from the DB (Postgres canonical); caches degrade to DB; SSE lossy; no listener permanently lost.

---
```yaml
id: TC-JOB-006-003
title: Stale listener state is cleared by the reconciler
primary_func_id: JOB-006
related_func_ids: []
module: brokers
test_level: L3
test_type: Data-Integrity
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_006_003_stale_state.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, data-integrity, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/listeners.py::reconcile_once (clears stale listener:state keys), listener_state.py]
evidence_requirements: [A listener:state key for a no-longer-desired listener is cleared on the next reconcile]
```
**Steps:** 1) Leave a stale `listener:state` key (disconnected trader). 2) Wait for a reconcile.
**Expected Results:** Stale state cleared; status pill no longer shows a phantom listener.

---
```yaml
id: TC-JOB-002-003
title: Alpaca WebSocket disconnect triggers exponential-backoff reconnect + backfill
primary_func_id: JOB-002
related_func_ids: [COPY-001]
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_002_003_ws_reconnect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/trade_listener.py (backoff 1s→60s; on reconnect _background_backfill via fills_sync, bounded 60s)]
evidence_requirements: [WS drop → reconnect with exponential backoff; on reconnect, un-fanned orders are backfilled once]
```
**Steps:** 1) Drop the Alpaca WS (fake). 2) Observe reconnect + backfill.
**Expected Results:** Exponential backoff 1s→60s; on reconnect, `fills_sync` backfills missed orders (bounded 60s) and fans out un-fanned ones (with the historical-replay guard).

---
```yaml
id: TC-JOB-003-003
title: SnapTrade poll listener transient failure reconnects with backoff
primary_func_id: JOB-003
related_func_ids: []
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_003_003_snaptrade_transient.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/snaptrade_listener.py (poll error → reconnecting state, break to reconnect)]
evidence_requirements: [A transient poll failure sets reconnecting state and resumes polling without losing the listener]
```
**Steps:** 1) Inject a transient SnapTrade poll error.
**Expected Results:** Listener enters reconnecting state and resumes; no permanent loss; verify-connection failure → credentials_invalid + notify (distinct path).

---
```yaml
id: TC-ADMIN-002-001
title: Listener status endpoint + admin listener-health reflect live listener state
primary_func_id: ADMIN-002
related_func_ids: [JOB-005]
module: brokers
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_admin_002_001_listener_health.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, admin, listener, P2]
source_refs: [GET /api/listener/status, GET /api/admin/listener-health, backend/app/services/listener_state.py]
evidence_requirements: [User status pill reflects own/followed listener; admin listener-health summary lists connected/down per trader]
```
> Mapping note: admin listener-health has no dedicated ADMIN Func ID in the baseline; mapped to ADMIN-002 (platform dashboards) with a recorded traceability gap.
**Steps:** 1) GET /api/listener/status (trader + subscriber views). 2) Admin GET /api/admin/listener-health.
**Expected Results:** Status endpoint returns per-role listener state; admin health lists connected/down counts. AuthZ: `/api/admin/listener-health` requires admin (403 otherwise).

---
```yaml
id: TC-COPY-001-013
title: Historical replay guard — listener receiving historical orders does not re-fan them out
primary_func_id: COPY-001
related_func_ids: [JOB-002, TRADE-001]
module: brokers
test_level: L3
test_type: Data-Integrity
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_001_013_historical_replay_guard.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, data-integrity, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py::order_predates_connection (grace 120s), trade_listener.py backfill]
evidence_requirements: [Orders that predate the listener connection are marked fanned-out WITHOUT mirroring; only genuinely new orders fan out]
```
**Steps:** 1) On (re)connect/backfill, the listener sees historical orders that predate the connection.
**Expected Results:** `order_predates_connection` marks them fanned-out without mirroring (120s grace, fail-open); no retroactive mirror storm. Also cross-ref **TC-TRADE-001-010** (app-originated marker prevents the API+listener double-fanout, point 22). Double-fanout guard (P0).
