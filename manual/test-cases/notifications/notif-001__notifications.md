# NOTIF-001 — In-app notifications

Parent **NOTIF-001** (continues at 003). Endpoints `/api/notifications*`. Source:
`backend/app/api/notifications.py` (`list_notifications`, `unread_count`, `mark_read`, `mark_all_read`),
`backend/app/services/notifications.py::create_notification` (SSE publish + opportunistic 30-day retention),
`backend/app/models/notification.py`, `backend/app/services/events.py`.

**Environment:** pure API cases `[local-qa, qa]`; trigger cases `[local-qa]` **BROKER_MODE=fake**. `@destructive` where they place/trigger orders. **Never production.**

---
```yaml
id: TC-NOTIF-001-003
title: Notification created after a mirror order's final rejection
primary_func_id: NOTIF-001
related_func_ids: [TRADE-001, COPY-003]
module: notifications
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-NOTIF-001-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (final rejection notify), notifications.create_notification]
evidence_requirements: [A mirror REJECTED at the broker creates ONE notification for the subscriber; visible via GET /api/notifications]
```
**Steps:** 1) Force a mirror rejection. 2) GET /api/notifications.
**Expected Results:** One rejection notification (type + message + metadata); scoped to the subscriber.

---
```yaml
id: TC-NOTIF-001-004
title: Notification created after retry exhaustion
primary_func_id: NOTIF-001
related_func_ids: [COPY-003, JOB-013]
module: notifications
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_004_retry_exhaust_notification.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/retry_scheduler.py::_notify_retry_failed]
evidence_requirements: [After retry_max_attempts, one "mirror failed after retry" notification is created]
```
**Steps:** 1) Exhaust retries (see TC-COPY-003-003). 2) GET notifications.
**Expected Results:** One retry-failed notification; matches the empty-state copy contract ("appears if a mirror fails after retry").

---
```yaml
id: TC-NOTIF-001-005
title: Notifications for daily pause, profit pause, auto-liquidation, and position auto-close
primary_func_id: NOTIF-001
related_func_ids: [RISK-001, RISK-002, RISK-003]
module: notifications
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-NOTIF-001-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/pnl_poller.py + notifications.create_notification (auto_paused/auto_liquidated/position auto-close)]
evidence_requirements: [Each auto-action creates the corresponding notification once; cross-ref TC-NOTIF-001-001/002 (SSE + in-app)]
```
**Steps (data-driven):** trigger daily loss pause, daily profit pause, auto-liquidation, position auto-close.
**Expected Results:** One notification per event, correct type/message; complements the SSE events (TC-NOTIF-001-001).

---
```yaml
id: TC-NOTIF-001-006
title: Notification ownership & cross-user protection
primary_func_id: NOTIF-001
related_func_ids: [AUTHZ-001]
module: notifications
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-NOTIF-001-006)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, notifications, permission, security, P0]
source_refs: [backend/app/api/notifications.py (all scoped to user.id; mark_read 404 if not owner)]
evidence_requirements: [GET returns only own notifications; marking another user's notification read → 404; no cross-user exposure]
```
**Steps:** 1) User B lists notifications (sees only own). 2) B marks A's notification id read.
**Expected Results:** List scoped to B; mark-read on A's id → 404. Cross-user-notification-exposure guard (P0).

---
```yaml
id: TC-NOTIF-001-007
title: List notifications — ordering (newest first), limit, unread filter, and empty state
primary_func_id: NOTIF-001
related_func_ids: []
module: notifications
test_level: L2
test_type: Boundary
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-NOTIF-001-007)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, notifications, boundary, P2]
source_refs: [GET /api/notifications (limit le=200, unread_only), backend/app/api/notifications.py::list_notifications]
evidence_requirements: [Newest-first order; limit caps results (le=200; note NO lower bound — baseline §item); unread_only filter; empty state returns []]
```
**Steps (data-driven):** default list; `?limit=5`; `?unread_only=true`; new account (empty).
**Expected Results:** Newest-first; limit honored; unread filter works; empty → `[]`. Note baseline: `limit` has no lower bound (`limit<=0` unvalidated) — record.

---
```yaml
id: TC-NOTIF-001-008
title: Unread count, mark-one-read (idempotent), and mark-all-read
primary_func_id: NOTIF-001
related_func_ids: []
module: notifications
test_level: L2
test_type: Functional
priority: P1
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-NOTIF-001-008)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, notifications, P1]
source_refs: [GET /api/notifications/unread-count, POST /{id}/read, POST /read-all]
evidence_requirements: [unread-count accurate; mark-one-read sets read_at once (idempotent second call still 200); mark-all-read clears all and returns count]
```
**Steps:** 1) Unread count. 2) Mark one read (twice). 3) Mark all read.
**Expected Results:** Count decrements; second mark-read idempotent (200, no change); mark-all sets remaining unread → read and returns rowcount.

---
```yaml
id: TC-NOTIF-001-009
title: SSE prepend — a new notification is delivered live and prepended
primary_func_id: NOTIF-001
related_func_ids: [JOB-007]
module: notifications
test_level: L3
test_type: Integration
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/sse.spec.ts (TC-NOTIF-001-009)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sse, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/notifications.py::create_notification (SSE publish notification.created), lib/sse]
evidence_requirements: [Creating a notification publishes notification.created on the user SSE channel]
```
**Steps:** 1) Open SSE. 2) Trigger a notification.
**Expected Results:** `notification.created` delivered live for prepend in the UI.

---
```yaml
id: TC-NOTIF-001-010
title: Duplicate-notification prevention (dedup markers)
primary_func_id: NOTIF-001
related_func_ids: [COPY-004, FOLLOW-001]
module: notifications
test_level: L3
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_010_dedup.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/bracket_emulator.py (bracket.trader_notified marker), follow_requests (approved pair no dup)]
evidence_requirements: [OCO trader-notify fires once (marker); re-requesting an already-approved follow does not re-notify]
```
**Steps:** 1) Trigger an OCO fill twice; 2) re-request an already-approved follow.
**Expected Results:** One notification each (dedup markers prevent repeats).

---
```yaml
id: TC-NOTIF-001-011
title: Redis outage — SSE becomes a no-op but the notification row is still created
primary_func_id: NOTIF-001
related_func_ids: []
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
automation_ref: automation/integration/test_tc_notif_001_011_redis_outage.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, redis, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/events.py (publish no-op on Redis error), notifications.create_notification]
evidence_requirements: [Redis down → notification persisted in DB; SSE publish silently no-ops (lossy by design); GET still returns it]
```
**Steps:** 1) Drop Redis. 2) Trigger a notification. 3) GET notifications.
**Expected Results:** DB row created; SSE no-op; the notification is visible on next poll/GET (Postgres canonical).

---
```yaml
id: TC-NOTIF-001-012
title: Notification creation failure does not roll back the core action (best-effort)
primary_func_id: NOTIF-001
related_func_ids: [SUB-001]
module: notifications
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_012_best_effort.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/subscribers.py::_unfollow (notification wrapped in try/except — swallow), baseline inconsistency: follow_requests _decide NOT wrapped]
evidence_requirements: [A notification failure during unfollow does NOT roll back the unfollow; note the inconsistency: _decide (approve/reject) is NOT wrapped and would roll back]
```
**Steps:** 1) Force notification creation to fail during unfollow.
**Expected Results:** Unfollow still succeeds (best-effort swallow). **Observe** the documented inconsistency: `follow_requests._decide` is NOT try/except-wrapped, so a notification failure there would roll back the decision — if reproduced twice, raise as Potential.

---
```yaml
id: TC-NOTIF-001-013
title: Opportunistic 30-day retention cleanup and boundary
primary_func_id: NOTIF-001
related_func_ids: []
module: notifications
test_level: L3
test_type: Boundary
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/jobs/background-jobs.spec.ts (TC-NOTIF-001-013)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, boundary, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/notifications.py::create_notification (opportunistic 30-day DELETE on create; NO cron)]
evidence_requirements: [Notifications older than 30 days are deleted opportunistically when a new one is created; boundary at ~30 days]
```
**Preconditions:** Seed notifications aged >30d and ~30d (time-controlled).
**Steps:** 1) Create a new notification (triggers cleanup).
**Expected Results:** >30-day rows deleted; ~30-day boundary retained; cleanup is opportunistic (no cron) — a user who never gets new notifications keeps old ones (documented).

---
```yaml
id: TC-NOTIF-001-014
title: Admin/global event channel — admins receive mirrored order.* events
primary_func_id: NOTIF-001
related_func_ids: [ADMIN-002, AUTHZ-001]
module: notifications
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_014_admin_global.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sse, admin, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/events.py (order.* mirrored to events:admin), backend/app/api/events.py (admins subscribe global)]
evidence_requirements: [An admin SSE connection receives global order.* events; non-admins do NOT receive the global channel]
```
**Steps:** 1) Admin opens SSE. 2) A trader places an order.
**Expected Results:** Admin receives the mirrored `order.*` on `events:admin`; non-admin users do not. (AuthZ: admin-only global channel.)

---
```yaml
id: TC-NOTIF-001-015
title: Sensitive broker-error content is redacted in notifications and captured evidence
primary_func_id: NOTIF-001
related_func_ids: [SEC-001]
module: notifications
test_level: L2
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_015_redaction.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, security, destructive, requires-fake-broker, P0]
source_refs: [backend/app/api/trades.py (reject_reason ≤480 chars), automation/common/redaction.ts]
evidence_requirements: [Rejection notifications/messages contain no tokens/keys/secrets; captured evidence passes redaction]
```
**Steps:** 1) Force a broker rejection whose raw error could contain sensitive text. 2) Inspect the notification message + evidence.
**Expected Results:** No credential/token content leaks into the notification or stored evidence (redaction applied). Token/credential-leak guard (P0).
