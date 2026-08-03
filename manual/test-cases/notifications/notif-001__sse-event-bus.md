# NOTIF-001 — Redis event bus & SSE stream

Parent **NOTIF-001** (SSE; continues at 016). Endpoint `GET /api/events?token=`. Source:
`backend/app/api/events.py::stream`, `backend/app/services/events.py` (publish/subscribe, per-user +
`events:admin` channels), `backend/app/core/security.py::decode_token`, `frontend/lib/sse.ts`.

**Environment:** `[local-qa]` (SSE + Redis). `@destructive` where events are triggered. **Never production.**

---
```yaml
id: TC-NOTIF-001-016
title: Channel isolation — user-specific channel; admin global channel; one user's events not delivered to another
primary_func_id: NOTIF-001
related_func_ids: [AUTHZ-001, ADMIN-002]
module: notifications
test_level: L3
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/sse.spec.ts (TC-NOTIF-001-016)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sse, security, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/events.py (events:user:{uuid}; admins also events:admin; order.* mirrored to admin)]
evidence_requirements: [User A's events go only to A's stream; A never receives B's events; admin additionally receives global order.*]
```
**Steps:** 1) Open SSE for A, B, and an admin. 2) Trigger events for A.
**Expected Results:** A receives A's events; B receives none of A's; admin receives mirrored global order.*. Cross-user-event-exposure guard (P0).

---
```yaml
id: TC-NOTIF-001-017
title: SSE heartbeat every 20 seconds keeps the connection alive
primary_func_id: NOTIF-001
related_func_ids: []
module: notifications
test_level: L3
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/sse.spec.ts (TC-NOTIF-001-017)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sse, P2]
source_refs: [backend/app/api/events.py (HEARTBEAT_SECONDS=20; ": connected" hello; ": heartbeat")]
evidence_requirements: [": connected" hello then ": heartbeat" every ~20s; correct SSE headers (no-cache, X-Accel-Buffering: no)]
```
**Steps:** 1) Open SSE and idle.
**Expected Results:** Hello then heartbeat every ~20s; headers set to prevent proxy buffering.

---
```yaml
id: TC-NOTIF-001-018
title: SSE auth via query token — invalid/expired/inactive rejected; token-in-URL is a logging-exposure Potential
primary_func_id: NOTIF-001
related_func_ids: [AUTHZ-001, SEC-001]
module: notifications
test_level: L2
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
defect_status: Potential
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/sse.spec.ts (TC-NOTIF-001-018)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, notifications, sse, security, P0]
source_refs: [backend/app/api/events.py::stream (manual decode_token; 401 invalid/wrong_token/user_inactive), baseline §15.6/§24 (token in URL query)]
evidence_requirements: [Invalid/expired/wrong-type token → 401; inactive user → 401; access token passed as ?token= (EventSource can't set headers)]
```
**Steps (data-driven):** no token; invalid; expired; wrong type; inactive user; valid.
**Expected Results:** Non-valid → 401 (`invalid_token`/`wrong_token`/`user_inactive`); valid → stream opens. **Known/Potential (baseline §24):** the access token is carried in the **URL query string**, which can be logged by proxies/servers (and lives in XSS-readable localStorage). `defect_status: Potential` — token-leakage exposure; **keep Potential until reproduced/reviewed** (recommend a one-time stream token). Token-leakage concern (P0).

---
```yaml
id: TC-NOTIF-001-019
title: Redis unavailable — SSE is lossy by design; Postgres remains canonical
primary_func_id: NOTIF-001
related_func_ids: [JOB-005]
module: notifications
test_level: L3
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_019_redis_lossy.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sse, redis, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/events.py (subscribe yields nothing on Redis error; publish no-op), backend/app/api/events.py (heartbeat keeps conn)]
evidence_requirements: [Redis down: no events delivered but the connection stays alive via heartbeat; canonical state readable from Postgres via normal GETs]
```
**Steps:** 1) Drop Redis with a stream open. 2) Trigger events.
**Expected Results:** No events delivered (lossy by design); heartbeat keeps the connection; the underlying data is still fetchable from the DB (Postgres canonical). No crash.

---
```yaml
id: TC-NOTIF-001-020
title: Reconnect, browser reconnect, and stale-connection cleanup
primary_func_id: NOTIF-001
related_func_ids: []
module: notifications
test_level: L3
test_type: Recovery
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_020_reconnect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sse, recovery, P2]
source_refs: [backend/app/api/events.py (request.is_disconnected polling), frontend/lib/sse.ts (backoff 1→30s, 90s stale-watchdog)]
evidence_requirements: [Server detects disconnect and ends the generator (cleanup); client reconnects with backoff; a 90s stale stream forces reconnect]
```
**Steps:** 1) Drop the client connection. 2) Reconnect. 3) Simulate a stale (no-event) stream >90s (client).
**Expected Results:** Server cleans up on disconnect; client reconnects with exponential backoff; stale-watchdog forces a reconnect. (Client backoff is frontend `sse.ts`.)

---
```yaml
id: TC-NOTIF-001-021
title: Event schema, ordering, and no duplicate delivery
primary_func_id: NOTIF-001
related_func_ids: []
module: notifications
test_level: L3
test_type: Data-Integrity
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/sse.spec.ts (TC-NOTIF-001-021)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sse, data-integrity, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/events.py (JSON payloads; malformed dropped with warning), event types order.placed/cancelled, copy.*, pnl.tick, position.auto_closed]
evidence_requirements: [Each event is well-formed JSON with a known type; delivered in publish order per channel; malformed payloads dropped, not duplicated]
```
**Steps:** 1) Trigger a sequence of events.
**Expected Results:** Valid JSON schema per event; per-channel ordering preserved; no duplicate delivery; malformed payloads dropped. Note baseline: some runtime event types (`copy.auto_*`, `pnl.tick`, `follow.*`) are handled `as any` in the frontend union (FE contract gap).

---
```yaml
id: TC-NOTIF-001-022
title: High event volume — stream remains responsive and lossy-tolerant under load
primary_func_id: NOTIF-001
related_func_ids: [PERF-001]
module: notifications
test_level: L5
test_type: Performance
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/sse.spec.ts (TC-NOTIF-001-022)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [perf, notifications, sse, destructive, requires-fake-broker, P2]
source_refs: [backend/app/api/events.py, backend/app/services/events.py]
evidence_requirements: [Under a burst of events + many concurrent SSE connections, latency stays bounded; drops are tolerated (lossy), no crash/leak]
```
**Steps (k6/perf):** 1) Many concurrent SSE clients + a burst of events (fanout at scale).
**Expected Results:** Bounded delivery latency; no connection leak or crash; lossy under extreme load (by design). Cross-ref PERF-001 fanout perf.
