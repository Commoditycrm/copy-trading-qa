# SUB-001 — Subscriber roster & management (trader-side)

Parent **SUB-001**. Endpoints `/api/subscribers*`. Source: `backend/app/api/subscribers.py`
(`list_subscribers`, `subscriber_stats`, `get_bulk_copy_state`, `set_bulk_copy_state`, `set_multiplier`,
`remove_subscriber`, `bulk_remove_subscribers`, `_unfollow`), `backend/app/services/cache.py`, `audit`.
All endpoints `require_trader`.

**Environment:** `[local-qa, qa]` (API + DB; seed fake subscribers). Non-destructive except remove (data). **Never production.**

---
```yaml
id: TC-SUB-001-001
title: List subscribers — pagination, search, per-row broker count & 30-day P&L
primary_func_id: SUB-001
related_func_ids: []
module: subscribers
test_level: L2
test_type: Functional
priority: P1
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/subscribers/test_tc_sub_001_001_list.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, subscribers, trader, requires-seed, P1]
source_refs: [GET /api/subscribers (search, limit 1–200, offset), backend/app/api/subscribers.py::list_subscribers, Page[SubscriberSummary]]
evidence_requirements: [Paginated Page{items,total,limit,offset}; search filters by email/name; per-page broker_count + 30-day realized P&L; only this trader's subscribers]
```
**Steps:** 1) Seed subscribers. 2) List with search + limit/offset.
**Expected Results:** Correct page + total; search substring; only own subscribers; per-row aggregates computed for the page.

---
```yaml
id: TC-SUB-001-002
title: Subscriber stats (cached) and bulk copy-state summary
primary_func_id: SUB-001
related_func_ids: []
module: subscribers
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/subscribers/test_tc_sub_001_002_stats.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, subscribers, trader, P2]
source_refs: [GET /api/subscribers/stats (cached 20s), GET /api/subscribers/copy-state, backend/app/api/subscribers.py]
evidence_requirements: [stats {total, active, with_broker} (cached); copy-state {total, enabled, paused}]
```
**Steps:** 1) GET stats + copy-state.
**Expected Results:** Correct counts; stats cached (~20s TTL).

---
```yaml
id: TC-SUB-001-003
title: Master fanout pause/resume (bulk copy-state)
primary_func_id: SUB-001
related_func_ids: [COPY-001]
module: subscribers
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/subscribers/test_tc_sub_001_003_bulk_copy_state.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, subscribers, trader, P1]
source_refs: [PATCH /api/subscribers/copy-state, backend/app/api/subscribers.py::set_bulk_copy_state (copy_paused = not enabled)]
evidence_requirements: [Sets TraderSettings.copy_paused; audit trader.copy_paused/resumed; cache busted; fanout halts when paused (cross-ref COPY-001-003)]
```
**Steps:** 1) PATCH copy-state enabled=false (pause), then true (resume). 2) Trader places an order while paused.
**Expected Results:** Master pause gates fanout (no mirrors while paused — does not touch subscribers' own flags); audited; cache busted.

---
```yaml
id: TC-SUB-001-004
title: Trader override of a subscriber's multiplier (bounds gt=0, le=100)
primary_func_id: SUB-001
related_func_ids: [COPY-001]
module: subscribers
test_level: L2
test_type: Boundary
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/subscribers/test_tc_sub_001_004_override_multiplier.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, subscribers, boundary, trader, P1]
source_refs: [PATCH /api/subscribers/{id}/multiplier (gt=0, le=100), backend/app/api/subscribers.py::set_multiplier (404 if not this trader's subscriber)]
evidence_requirements: [Valid override persisted + audited + cache busted; 0/-1/100.01 → 422; foreign subscriber → 404]
```
**Steps:** 1) Override multiplier (valid + boundaries). 2) Override a non-subscriber → 404.
**Expected Results:** Bounds enforced (note trader ceiling le=100 vs subscriber self le=10); only own subscribers (404 otherwise).

---
```yaml
id: TC-SUB-001-005
title: Remove a single subscriber (unfollow, revoke approval, notify)
primary_func_id: SUB-001
related_func_ids: [FOLLOW-001, NOTIF-001]
module: subscribers
test_level: L2
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/subscribers/test_tc_sub_001_005_remove.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, subscribers, data-integrity, trader, P1]
source_refs: [DELETE /api/subscribers/{id}, backend/app/api/subscribers.py::remove_subscriber/_unfollow]
evidence_requirements: [following_trader_id=null, copy_enabled=false, FollowRequest deleted; audit trader.subscriber_removed; best-effort notification; returns {ok, removed:1} (200)]
```
**Steps:** 1) Remove a subscriber. 2) Verify state + audit + notification.
**Expected Results:** Unfollowed, copy off, approval revoked; audited; notification best-effort (failure doesn't roll back — TC-NOTIF-001-012); 200 with body.

---
```yaml
id: TC-SUB-001-006
title: Bulk-remove subscribers (partial success; non-matching IDs silently skipped)
primary_func_id: SUB-001
related_func_ids: []
module: subscribers
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/subscribers/test_tc_sub_001_006_bulk_remove.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, subscribers, trader, P2]
source_refs: [POST /api/subscribers/bulk-remove (ids min 1 max 500), backend/app/api/subscribers.py::bulk_remove_subscribers]
evidence_requirements: [Only this trader's IDs removed; foreign/unknown IDs silently skipped; returns {ok, removed:count}]
```
**Steps:** 1) Bulk-remove a mix of own + foreign IDs.
**Expected Results:** Own removed; others skipped (documented partial-success); count reflects actual removals.

---
```yaml
id: TC-SUB-001-007
title: Authorization — subscriber endpoints require trader; ownership scoping
primary_func_id: SUB-001
related_func_ids: [AUTHZ-001]
module: subscribers
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/subscribers/test_tc_sub_001_007_authz.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, subscribers, permission, security, P0]
source_refs: [backend/app/api/subscribers.py (require_trader; per-ID checks following_trader_id==trader.id → 404)]
evidence_requirements: [Subscriber/admin → 403 subscriber-list endpoints; operating on another trader's subscriber → 404; no cross-trader roster access]
```
**Steps:** 1) Subscriber/admin call /api/subscribers → 403. 2) Trader A operates on Trader B's subscriber → 404.
**Expected Results:** require_trader enforced; a trader only sees/acts on their own subscribers. Cross-trader-roster access blocked (P0).
