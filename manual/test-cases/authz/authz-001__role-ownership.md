# AUTHZ-001 — Role & ownership authorization

Parent: **AUTHZ-001**. Cross-cutting guards in `backend/app/api/deps.py`
(`current_user`, `require_trader`, `require_subscriber`, `require_admin`) plus per-resource ownership
checks. Verified against representative endpoints in each router.

---
```yaml
id: TC-AUTHZ-001-001
title: Subscriber calling a trader-only endpoint is forbidden (403 trader_only)
primary_func_id: AUTHZ-001
related_func_ids: [TRADE-001]
module: authz
test_level: L2
test_type: Permission
priority: P1
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_001_subscriber_blocked_trader_endpoint.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, security, P1]
source_refs: [backend/app/api/deps.py::require_trader, POST /api/trades]
evidence_requirements: [403 trader_only; no order created]
```
**Preconditions:** Subscriber access token.
**Steps:** 1) POST /api/trades as a subscriber.
**Expected Results:** 403 `trader_only`; no order row created.

---
```yaml
id: TC-AUTHZ-001-002
title: Trader calling a subscriber-only endpoint is forbidden (403 subscriber_only)
primary_func_id: AUTHZ-001
related_func_ids: [RISK-001]
module: authz
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_002_trader_blocked_subscriber_endpoint.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, security, P1]
source_refs: [backend/app/api/deps.py::require_subscriber, GET /api/settings/subscriber]
evidence_requirements: [403 subscriber_only]
```
**Steps:** 1) GET /api/settings/subscriber as a trader.
**Expected Results:** 403 `subscriber_only`.

---
```yaml
id: TC-AUTHZ-001-003
title: Non-admin calling an admin endpoint is forbidden (403 admin_only)
primary_func_id: AUTHZ-001
related_func_ids: [ADMIN-001]
module: authz
test_level: L2
test_type: Permission
priority: P1
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_003_nonadmin_blocked_admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, security, P1]
source_refs: [backend/app/api/deps.py::require_admin, GET /api/admin/stats]
evidence_requirements: [403 admin_only for trader AND subscriber tokens]
```
**Steps:** 1) GET /api/admin/stats as trader. 2) as subscriber.
**Expected Results:** 403 `admin_only` in both cases.

---
```yaml
id: TC-AUTHZ-001-004
title: Accessing another user's order returns 404 (ownership hidden, not 403)
primary_func_id: AUTHZ-001
related_func_ids: [HIST-001]
module: authz
test_level: L2
test_type: Permission
priority: P1
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_004_cross_user_order_404.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, security, data-integrity, P1]
source_refs: [GET /api/trades/{order_id} (ownership → 404, existence hiding)]
evidence_requirements: [404 not_found when order belongs to another user; body reveals nothing]
```
**Preconditions:** User A owns order O; user B is a separate account.
**Steps:** 1) GET /api/trades/{O} as user B.
**Expected Results:** 404 `not_found` (not 403); no cross-tenant data leak.

---
```yaml
id: TC-AUTHZ-001-005
title: Forged JWT (wrong signing secret) is rejected (401 invalid_token)
primary_func_id: AUTHZ-001
related_func_ids: []
module: authz
test_level: L2
test_type: Security
priority: P1
risk: Critical
environment: [local-qa]   # forged-token test — ISOLATED env only, dedicated QA-only secret; NEVER production
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_005_forged_jwt.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, security, negative, P1]
source_refs: [backend/app/core/security.py::decode_token, deps.current_user]
evidence_requirements: [401 invalid_token for a token signed with a wrong secret / elevated role]
```
**Steps:** 1) Mint an access token with role=admin signed by a WRONG secret. 2) Call GET /api/admin/stats.
**Expected Results:** 401 `invalid_token` (signature check fails; privilege forgery prevented).

---
```yaml
id: TC-AUTHZ-001-006
title: Expired access token is rejected (401)
primary_func_id: AUTHZ-001
related_func_ids: [AUTH-003]
module: authz
test_level: L2
test_type: Boundary
priority: P1
risk: High
environment: [local-qa]   # minted token — isolated env, QA-only secret; never prod
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_006_expired_access.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, security, boundary, P1]
source_refs: [backend/app/core/security.py::decode_token, deps.current_user]
evidence_requirements: [401 for an expired access token on a protected GET]
```
**Steps:** 1) Mint an expired access token (QA secret). 2) GET /api/auth/me.
**Expected Results:** 401.

---
```yaml
id: TC-AUTHZ-001-007
title: Missing token on a protected endpoint returns 401 missing_token
primary_func_id: AUTHZ-001
related_func_ids: []
module: authz
test_level: L2
test_type: Negative
priority: P1
risk: High
environment: [local-qa, qa, prod]
production_safe: true
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/smoke/tests/tc-authz-001-007-missing-token.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, negative, smoke, prod-safe, P1]
source_refs: [backend/app/api/deps.py::current_user (auto_error=false)]
evidence_requirements: [401 missing_token with no Authorization header]
```
**Steps:** 1) GET /api/auth/me with no Authorization header.
**Expected Results:** 401 `missing_token`. (Read-only — safe to run as a prod smoke check.)

---
```yaml
id: TC-AUTHZ-001-008
title: Frontend hides trader-only pages but backend enforces — direct API by subscriber is blocked
primary_func_id: AUTHZ-001
related_func_ids: [TRADE-001]
module: authz
test_level: L2
test_type: Security
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_008_fe_gap_backend_enforces.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, security, permission, P1]
source_refs:
  - baseline §7/§24 (frontend route-gating gap; backend require_trader is the real gate)
  - POST /api/trades
evidence_requirements: [Direct subscriber API call to a trader-only action → 403 (server-side enforcement)]
```
**Rationale:** The Next.js app only *hides* trader-only nav from subscribers; it does not route-gate. This confirms the server is the real gate.
**Steps:** 1) As a subscriber, call the trader-only API directly (bypassing UI), e.g. POST /api/trades.
**Expected Results:** 403 `trader_only` — the frontend gap is not a security hole because the backend enforces.
```
