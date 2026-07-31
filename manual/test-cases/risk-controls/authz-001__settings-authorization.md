# Subscriber-settings authorization (maps to AUTHZ-001)

Role/ownership guards on the subscriber-settings endpoints. Maps to **AUTHZ-001**, continuing the
permanent sequence at **014**. Source: `backend/app/api/deps.py::require_subscriber`,
`backend/app/api/settings.py` (self-scoped — no user_id path param), `follow` approval gate.

**Environment:** `[local-qa, qa]`, non-destructive.

---
```yaml
id: TC-AUTHZ-001-014
title: Non-subscriber (trader/admin) cannot access subscriber settings (403 subscriber_only)
primary_func_id: AUTHZ-001
related_func_ids: [RISK-001]
module: risk-controls
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-authz.spec.ts (TC-AUTHZ-001-014)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, risk-controls, permission, security, P1]
source_refs: [backend/app/api/deps.py::require_subscriber; GET/PATCH /api/settings/subscriber/*]
evidence_requirements: [403 subscriber_only for trader and admin tokens on GET + a representative PATCH]
```
**Steps:** 1) Trader and admin call GET /api/settings/subscriber and a PATCH (e.g. multiplier).
**Expected Results:** 403 `subscriber_only` in all cases; no settings mutated.

---
```yaml
id: TC-AUTHZ-001-015
title: Settings are self-scoped — a subscriber can only read/modify their own settings
primary_func_id: AUTHZ-001
related_func_ids: [RISK-001]
module: risk-controls
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-authz.spec.ts (TC-AUTHZ-001-015)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, risk-controls, permission, security, P0]
source_refs: [backend/app/api/settings.py (settings resolved from current_user, no cross-user id param)]
evidence_requirements: [A subscriber's PATCH affects ONLY their own row; there is no endpoint parameter to target another user's settings]
```
**Steps:** 1) Subscriber A changes a setting. 2) Verify subscriber B's settings are unchanged; confirm no request shape allows targeting B.
**Expected Results:** Settings are keyed to the authenticated user only — no cross-user modification vector.

---
```yaml
id: TC-AUTHZ-001-016
title: Follow requires approval — PATCH follow without an approved request is refused (403)
primary_func_id: AUTHZ-001
related_func_ids: [FOLLOW-001]
module: risk-controls
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-authz.spec.ts (TC-AUTHZ-001-016)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, risk-controls, permission, security, P1]
source_refs: [backend/app/api/settings.py::follow_trader (APPROVED FollowRequest or auto_approve required → else 403 follow_not_approved)]
evidence_requirements: [403 follow_not_approved when setting following_trader_id without approval; succeeds when approved or trader auto-approves]
```
**Steps:** 1) Subscriber PATCHes follow to a trader with no approval and `auto_approve_follows=false`.
**Expected Results:** 403 `follow_not_approved`; a subscriber cannot bypass the approval workflow via the settings API. Succeeds once approved or if the trader auto-approves.
```
