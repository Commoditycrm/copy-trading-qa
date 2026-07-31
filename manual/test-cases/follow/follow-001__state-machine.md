# FOLLOW-001 — Follow-request state machine

Parent **FOLLOW-001** (continues at 004; 001–003 were notifications). Endpoints `/api/follow-requests*`
and `PATCH /api/settings/subscriber/follow`. Source: `backend/app/api/follow_requests.py`
(`create_follow_request`, `_decide`, `cancel_follow_request`, listings), `backend/app/api/settings.py::follow_trader`,
`backend/app/models/follow_request.py` (status enum, uq_follow_request_pair), `backend/app/api/subscribers.py::_unfollow`.

**Environment:** `[local-qa, qa]` (pure API + DB). Non-destructive. **Never production.**

---
```yaml
id: TC-FOLLOW-001-004
title: Create a follow request — PENDING (or auto-approved when the trader auto-approves)
primary_func_id: FOLLOW-001
related_func_ids: []
module: follow
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_004_create.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, subscriber, P1]
source_refs: [POST /api/follow-requests, backend/app/api/follow_requests.py::create_follow_request]
evidence_requirements: [201 FollowRequestOut PENDING; auto_approve trader → APPROVED + following set; target must be an active TRADER (else 404 trader_not_found)]
```
**Steps:** 1) Subscriber requests a normal trader (PENDING). 2) Requests an auto-approve trader (APPROVED). 3) Requests a non-trader → 404.
**Expected Results:** PENDING / auto-APPROVED as annotated; invalid target → 404.

---
```yaml
id: TC-FOLLOW-001-005
title: Approve transitions PENDING→APPROVED and auto-sets following_trader_id
primary_func_id: FOLLOW-001
related_func_ids: [SUB-001]
module: follow
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_005_approve.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, trader, data-integrity, P1]
source_refs: [POST /api/follow-requests/{id}/approve, backend/app/api/follow_requests.py::_decide]
evidence_requirements: [Status APPROVED + decided_at; subscriber SubscriberSettings.following_trader_id=trader; cache busted]
```
**Steps:** 1) Trader approves a PENDING request.
**Expected Results:** APPROVED; subscriber auto-follows the trader; cache invalidated for old+new trader.

---
```yaml
id: TC-FOLLOW-001-006
title: Reject transitions PENDING→REJECTED without following
primary_func_id: FOLLOW-001
related_func_ids: []
module: follow
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_006_reject.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, trader, P2]
source_refs: [POST /api/follow-requests/{id}/reject, backend/app/api/follow_requests.py::_decide]
evidence_requirements: [Status REJECTED + decided_at; following NOT set]
```
**Steps:** 1) Trader rejects a PENDING request.
**Expected Results:** REJECTED; no follow relationship created.

---
```yaml
id: TC-FOLLOW-001-007
title: Subscriber cancels own PENDING request (DELETE) and cannot cancel a decided one
primary_func_id: FOLLOW-001
related_func_ids: []
module: follow
test_level: L2
test_type: Boundary
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_007_cancel.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, boundary, negative, P2]
source_refs: [DELETE /api/follow-requests/{id}, backend/app/api/follow_requests.py::cancel_follow_request (404 not owner; 409 not_pending)]
evidence_requirements: [Own PENDING → 204 deleted; not owner → 404; non-pending → 409 not_pending]
```
**Steps (data-driven):** cancel own pending (204); cancel another's (404); cancel a decided one (409).
**Expected Results:** As annotated.

---
```yaml
id: TC-FOLLOW-001-008
title: Decision state guards — deciding a non-PENDING request returns 409; re-request reopens PENDING
primary_func_id: FOLLOW-001
related_func_ids: []
module: follow
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_008_state_guards.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, boundary, negative, P1]
source_refs: [backend/app/api/follow_requests.py::_decide (status != PENDING → 409 not_pending); re-request flips row back to pending]
evidence_requirements: [Approve/reject an already-decided request → 409 not_pending; a rejected pair re-requested → PENDING again (same row)]
```
**Steps:** 1) Approve twice. 2) After a reject, subscriber re-requests.
**Expected Results:** Second decision → 409 `not_pending`; re-request reopens the same pair row to PENDING (transition modeled).

---
```yaml
id: TC-FOLLOW-001-009
title: Unique-pair constraint — one FollowRequest row per (subscriber, trader)
primary_func_id: FOLLOW-001
related_func_ids: []
module: follow
test_level: L2
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_009_unique_pair.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, data-integrity, P1]
source_refs: [backend/app/models/follow_request.py (uq_follow_request_pair), create_follow_request (existing APPROVED returned unchanged)]
evidence_requirements: [Re-requesting an existing pair reuses the single row (no duplicate); existing APPROVED pair returned unchanged (no dup notification)]
```
**Steps:** 1) Create, then re-create the same pair in various states.
**Expected Results:** Exactly one row per pair (unique constraint); APPROVED pair short-circuits (no dup).

---
```yaml
id: TC-FOLLOW-001-010
title: Authorization & ownership across the follow endpoints
primary_func_id: FOLLOW-001
related_func_ids: [AUTHZ-001]
module: follow
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_010_authz.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, permission, security, P0]
source_refs: [backend/app/api/follow_requests.py (require_subscriber create/cancel/mine; require_trader incoming/approve/reject; ownership → 404)]
evidence_requirements: [Subscriber-only create/cancel/mine; trader-only incoming/approve/reject; deciding another trader's request → 404; cross-role → 403]
```
**Steps:** 1) Trader tries create (403). 2) Subscriber tries approve (403). 3) Trader B decides Trader A's request (404).
**Expected Results:** Role guards enforced; a trader cannot decide requests addressed to another trader (404). Cross-user follow-decision blocked (P0).

---
```yaml
id: TC-FOLLOW-001-011
title: Listing incoming / mine with status filter
primary_func_id: FOLLOW-001
related_func_ids: []
module: follow
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_011_listings.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, P2]
source_refs: [GET /api/follow-requests/mine, /incoming (status alias; ?status=all; invalid → 422)]
evidence_requirements: [mine lists all own requests; incoming defaults pending; ?status=all → history; invalid status → 422; identities populated]
```
**Steps:** 1) Subscriber GET mine. 2) Trader GET incoming (default + all + invalid).
**Expected Results:** Correct scoping + status filtering; invalid status → 422.

---
```yaml
id: TC-FOLLOW-001-012
title: Removing a subscriber (unfollow) deletes the FollowRequest, revoking approval
primary_func_id: FOLLOW-001
related_func_ids: [SUB-001]
module: follow
test_level: L2
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/follow/test_tc_follow_001_012_unfollow_revokes.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, follow, data-integrity, P1]
source_refs: [backend/app/api/subscribers.py::_unfollow (deletes FollowRequest → re-follow requires new request)]
evidence_requirements: [After a trader removes a subscriber, the FollowRequest row is deleted; re-follow requires a fresh approval]
```
**Steps:** 1) Approve + follow. 2) Trader removes the subscriber. 3) Subscriber attempts to re-follow directly.
**Expected Results:** Follow request deleted; direct follow now 403 `follow_not_approved` (see TC-AUTHZ-001-016); requires a new request. Approval-revocation modeled.
