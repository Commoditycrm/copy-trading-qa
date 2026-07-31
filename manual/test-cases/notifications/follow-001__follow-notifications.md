# FOLLOW-001 — Follow-request notifications

Parent **FOLLOW-001** (notifications side; continues at 001). Source:
`backend/app/api/follow_requests.py` (`create_follow_request`, `_decide`),
`backend/app/services/notifications.py`, follow-decision email background tasks.

**Environment:** `[local-qa, qa]` (pure API + notification rows). Non-destructive. **Never production.**

---
```yaml
id: TC-FOLLOW-001-001
title: Follow-request creates a notification to the trader (unless auto-approve)
primary_func_id: FOLLOW-001
related_func_ids: [NOTIF-001]
module: notifications
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/notifications/test_tc_follow_001_001_request_notification.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, notifications, follow, P1]
source_refs: [POST /api/follow-requests, backend/app/api/follow_requests.py::create_follow_request (notify type follow.requested)]
evidence_requirements: [Subscriber request → trader gets a follow.requested notification; auto_approve → NO request notification]
```
**Steps:** 1) Subscriber requests to follow a non-auto-approve trader. 2) Repeat with an auto-approve trader.
**Expected Results:** Non-auto-approve → trader notified (`follow.requested`); auto-approve → auto-approved, no request notification.

---
```yaml
id: TC-FOLLOW-001-002
title: Follow approval creates a notification to the subscriber
primary_func_id: FOLLOW-001
related_func_ids: [NOTIF-001]
module: notifications
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/notifications/test_tc_follow_001_002_approve_notification.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, notifications, follow, P1]
source_refs: [POST /api/follow-requests/{id}/approve, backend/app/api/follow_requests.py::_decide (notify follow.approved)]
evidence_requirements: [Approve → subscriber gets follow.approved notification; following_trader_id set]
```
**Steps:** 1) Trader approves a pending request.
**Expected Results:** Subscriber notified (`follow.approved`); auto-follow set; email background task queued.

---
```yaml
id: TC-FOLLOW-001-003
title: Follow rejection creates a notification to the subscriber
primary_func_id: FOLLOW-001
related_func_ids: [NOTIF-001]
module: notifications
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/notifications/test_tc_follow_001_003_reject_notification.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, notifications, follow, P2]
source_refs: [POST /api/follow-requests/{id}/reject, backend/app/api/follow_requests.py::_decide (notify follow.rejected)]
evidence_requirements: [Reject → subscriber gets follow.rejected notification; status=REJECTED; decided_at set]
```
**Steps:** 1) Trader rejects a pending request.
**Expected Results:** Subscriber notified (`follow.rejected`); request REJECTED. Note: `_decide` notification is NOT try/except-wrapped (see TC-NOTIF-001-012 observation).
