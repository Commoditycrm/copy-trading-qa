# AUTH-001 — Register

Parent functionality: **AUTH-001** (baseline §29). Endpoint: `POST /api/auth/register`.
Source: `backend/app/api/auth.py::register`, `backend/app/schemas/auth.py::RegisterIn`,
`backend/app/services/rate_limit.py::register_ip_throttled`, `backend/app/services/audit.py`.

---
```yaml
id: TC-AUTH-001-001
title: Register a valid subscriber returns 201 and seeds subscriber settings
primary_func_id: AUTH-001
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
automation_ref: automation/api/tests/auth/test_tc_auth_001_001_register_valid_subscriber.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, P1, regression, subscriber]
source_refs:
  - POST /api/auth/register
  - backend/app/api/auth.py::register
  - backend/app/schemas/auth.py::RegisterIn
evidence_requirements:
  - API request + response (status 201, UserOut body)
  - DB assertion: User row + SubscriberSettings(copy_enabled=false, multiplier=1.000) seeded
  - Audit row user.register present
```
**Preconditions:** No user exists with the test email.
**Test Data:** email `qa+sub-<runid>@kopyya.test`, valid password (≥8, ≥3 char classes), role=subscriber.
**Steps:** 1) POST /api/auth/register with the payload.
**Expected Results:** 201; `UserOut` (role=subscriber, is_active=true, email_verified=false); `SubscriberSettings` seeded; `TraderSettings` NOT created; `audit user.register` written; verification email queued (log sink).

---
```yaml
id: TC-AUTH-001-002
title: Register a valid trader with business_name returns 201 and seeds trader settings
primary_func_id: AUTH-001
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
automation_ref: automation/api/tests/auth/test_tc_auth_001_002_register_valid_trader.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, P1, regression, trader]
source_refs:
  - POST /api/auth/register
  - backend/app/schemas/auth.py::RegisterIn::_require_business_name_for_trader
evidence_requirements:
  - Response 201 UserOut (role=trader, business_name set)
  - DB: TraderSettings(trading_enabled=true) seeded
```
**Preconditions:** Email unused.
**Test Data:** role=trader, `business_name="QA Signals <runid>"`, valid password.
**Steps:** 1) POST register.
**Expected Results:** 201; `TraderSettings(trading_enabled=true)` seeded; `SubscriberSettings` NOT created.

---
```yaml
id: TC-AUTH-001-003
title: Register with an already-registered email returns 409 and creates no second row
primary_func_id: AUTH-001
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
automation_ref: automation/api/tests/auth/test_tc_auth_001_003_register_duplicate_email.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, P1, regression]
source_refs:
  - POST /api/auth/register
  - backend/app/api/auth.py::register
evidence_requirements:
  - Response 409 detail=email_taken
  - DB assertion: exactly one user row for the email (data integrity)
```
**Preconditions:** A user already exists with the email (create via TC-AUTH-001-001).
**Test Data:** Same email, valid password/role.
**Steps:** 1) POST register with the existing email.
**Expected Results:** 409 `email_taken`; no second user row; no additional verification email.

---
```yaml
id: TC-AUTH-001-004
title: Register as trader without business_name is rejected (422)
primary_func_id: AUTH-001
related_func_ids: []
module: auth
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_001_004_trader_requires_business_name.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, P1]
source_refs:
  - backend/app/schemas/auth.py::RegisterIn::_require_business_name_for_trader
evidence_requirements: [Response 422 with business_name validation error]
```
**Preconditions:** Email unused.
**Test Data:** role=trader, business_name omitted/blank.
**Steps:** 1) POST register.
**Expected Results:** 422; no user created.

---
```yaml
id: TC-AUTH-001-005
title: Self-registration as admin is blocked (422)
primary_func_id: AUTH-001
related_func_ids: [AUTHZ-001]
module: auth
test_level: L2
test_type: Security
priority: P1
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_001_005_admin_self_reg_blocked.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, security, negative, P1]
source_refs:
  - backend/app/schemas/auth.py::RegisterIn (role restricted to trader|subscriber)
evidence_requirements: [Response 422; DB: no admin user created]
```
**Preconditions:** Email unused.
**Test Data:** role=admin.
**Steps:** 1) POST register with role=admin.
**Expected Results:** 422 "role must be 'trader' or 'subscriber'"; no admin account created (privilege-escalation prevention).

---
```yaml
id: TC-AUTH-001-006
title: Password policy boundaries — length and complexity enforced
primary_func_id: AUTH-001
related_func_ids: []
module: auth
test_level: L2
test_type: Boundary
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_001_006_password_policy.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, boundary, negative, P1]
source_refs:
  - backend/app/schemas/auth.py::RegisterIn::_validate_password_strength
evidence_requirements: [Response per sub-case: 422 for invalid, 201 for valid]
```
**Preconditions:** Fresh emails per sub-case.
**Test Data / Steps (data-driven):**
1. 7-char password → 422 (below min 8).
2. 8-char password meeting ≥3 char classes → 201 (lower boundary accepted).
3. 8-char all-lowercase (only 1 class) → 422 (complexity: ≥3 of {lower,upper,digit,symbol}).
4. Password of 73 bytes → 422 (exceeds 72-byte bcrypt cap).
**Expected Results:** As annotated per sub-case.

---
```yaml
id: TC-AUTH-001-007
title: Email is normalized to lowercase/trimmed on registration (data integrity)
primary_func_id: AUTH-001
related_func_ids: [AUTH-002]
module: auth
test_level: L2
test_type: Data-Integrity
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_001_007_email_normalization.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, data-integrity, P2]
source_refs:
  - backend/app/schemas/auth.py::RegisterIn (_normalize_email before-validator)
evidence_requirements: [Stored email is lowercase; subsequent login with lowercase works]
```
**Preconditions:** Email unused.
**Test Data:** ` QA+Case-<runid>@Kopyya.TEST ` (mixed case, whitespace).
**Steps:** 1) POST register. 2) Login with the lowercased/trimmed email.
**Expected Results:** Stored email lowercased+trimmed; login succeeds with the normalized form.

---
```yaml
id: TC-AUTH-001-008
title: Registration IP throttle returns 429 with Retry-After (recovery)
primary_func_id: AUTH-001
related_func_ids: []
module: auth
test_level: L2
test_type: Recovery
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/register-ratelimit.spec.ts (TC-AUTH-001-008)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, recovery, negative, P2]
source_refs:
  - backend/app/services/rate_limit.py::register_ip_throttled
evidence_requirements: [429 too_many_requests + Retry-After header after threshold]
```
**Preconditions:** Redis reachable (limiter fails open if down — note in results).
**Test Data:** >15 registrations/hour from one IP.
**Steps:** 1) POST register repeatedly past the threshold.
**Expected Results:** 429 `too_many_requests` + `Retry-After`; recovery: requests succeed again after the window. (If Redis down, limiter fails open — record as environmental.)

---
```yaml
id: TC-AUTH-001-009
title: Registration queues a verification email and does not block login (integration)
primary_func_id: AUTH-001
related_func_ids: [AUTH-005, AUTH-002]
module: auth
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/... (backend sink) or api if log-scrape available
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integration, auth, P2]
source_refs:
  - backend/app/api/auth.py::register (BackgroundTask send_verification_email)
  - backend/app/services/email.py (log mode when SENDGRID_API_KEY blank)
evidence_requirements: [Email/link captured from log sink; account usable pre-verification]
```
**Preconditions:** SendGrid in log mode (blank key) in QA.
**Steps:** 1) Register. 2) Capture the verification link from the email sink/log. 3) Login before verifying.
**Expected Results:** Verification email/link produced (soft verification); login works with `email_verified=false`.
```
