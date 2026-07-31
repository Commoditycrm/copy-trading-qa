# AUTH-002 — Login

Parent: **AUTH-002**. Endpoint: `POST /api/auth/login`.
Source: `backend/app/api/auth.py::login`, `backend/app/core/security.py` (verify_password, create tokens),
`backend/app/services/rate_limit.py` (login_locked, login_ip_throttled), `audit`.

---
```yaml
id: TC-AUTH-002-001
title: Valid login returns access + refresh token pair
primary_func_id: AUTH-002
related_func_ids: []
module: auth
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_002_001_login_valid.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, P1, regression]
source_refs: [POST /api/auth/login, backend/app/api/auth.py::login]
evidence_requirements: [200 TokenPair (access+refresh); audit user.login]
```
**Preconditions:** Active user exists (seed).
**Steps:** 1) POST login with correct credentials.
**Expected Results:** 200; `TokenPair`; access token decodes with role+`type=access`; `audit user.login`; login-failure counter reset.

---
```yaml
id: TC-AUTH-002-002
title: Wrong password returns 401 invalid_credentials and audits the failure
primary_func_id: AUTH-002
related_func_ids: []
module: auth
test_level: L2
test_type: Negative
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_002_002_login_wrong_password.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, P1]
source_refs: [backend/app/api/auth.py::login, rate_limit.record_login_failure]
evidence_requirements: [401 invalid_credentials; audit user.login_failed]
```
**Steps:** 1) POST login with valid email, wrong password.
**Expected Results:** 401 `invalid_credentials`; `audit user.login_failed`; no token issued.

---
```yaml
id: TC-AUTH-002-003
title: Inactive (deactivated) user cannot log in (403 user_inactive)
primary_func_id: AUTH-002
related_func_ids: [ADMIN-001]
module: auth
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/login.spec.ts (TC-AUTH-002-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, permission, negative, P1]
source_refs: [backend/app/api/auth.py::login (is_active check)]
evidence_requirements: [403 user_inactive]
```
**Preconditions:** User exists and is deactivated (admin set is_active=false).
**Steps:** 1) POST login with correct credentials of the inactive user.
**Expected Results:** 403 `user_inactive`; no token.

---
```yaml
id: TC-AUTH-002-004
title: Repeated failures trip the per-email lock (429) and recover after the window
primary_func_id: AUTH-002
related_func_ids: []
module: auth
test_level: L2
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_002_004_login_lockout.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, recovery, boundary, P1]
source_refs: [backend/app/services/rate_limit.py::login_locked, login_ip_throttled]
evidence_requirements: [429 too_many_attempts + Retry-After after 8 failures/15m; audit user.login_rate_limited]
```
**Test Data:** 8+ failed logins for one email within 15 minutes.
**Steps:** 1) Fail login N times to cross the per-email threshold. 2) Attempt again.
**Expected Results:** 429 `too_many_attempts` + `Retry-After`; `audit user.login_rate_limited`; recovery: valid login succeeds after the window (or counter reset). Limiter fails open if Redis down (record).

---
```yaml
id: TC-AUTH-002-005
title: Unverified email can still log in (soft verification) — data integrity
primary_func_id: AUTH-002
related_func_ids: [AUTH-005]
module: auth
test_level: L2
test_type: Data-Integrity
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_002_005_login_unverified.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, data-integrity, P2]
source_refs: [backend/app/api/auth.py::login (no email_verified gate)]
evidence_requirements: [200 TokenPair for a user with email_verified=false]
```
**Steps:** 1) Register (unverified). 2) Login.
**Expected Results:** 200; login is permitted despite `email_verified=false` (documented soft-verification behavior).

---
```yaml
id: TC-AUTH-002-006
title: Production login health smoke (read-shaped) — @prod-safe
primary_func_id: AUTH-002
related_func_ids: []
module: auth
test_level: Smoke
test_type: Smoke
priority: P1
risk: High
environment: [prod]
production_safe: true
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/smoke/tests/tc-auth-002-006-prod-login-smoke.spec.ts
owner: unassigned
status: Blocked
last_reviewed: 2026-07-30
tags: [smoke, prod-safe, api, P1]
source_refs: [POST /api/auth/login]
evidence_requirements: [200 with a pre-provisioned read-only seeded account; NO data created]
```
**BLOCKED:** Do not execute until **DevOps provides a dedicated read-only production smoke account**.
**Must NOT use a normal admin, trader, subscriber, or customer account.** Credentials come from the
DevOps-owned secret store; the account is scoped to read-only paths.
**Preconditions:** Dedicated read-only prod smoke account provisioned by DevOps.
**Steps:** 1) POST login with the dedicated read-only account.
**Expected Results:** 200 token issued; no business data created (login is read-shaped on the prod
allow-list). Token used only for subsequent read-only smoke checks. **Unblock when the account exists.**
```
