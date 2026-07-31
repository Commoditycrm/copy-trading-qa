# AUTH-004 — Password reset

Parent: **AUTH-004**. Endpoints: `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.
Source: `backend/app/api/auth.py::forgot_password / reset_password`,
`backend/app/core/security.py` (create/decode reset token, password_fingerprint_matches),
`backend/app/services/email.py`.

---
```yaml
id: TC-AUTH-004-001
title: Forgot-password always returns a generic message (anti-enumeration) and queues a link for a real user
primary_func_id: AUTH-004
related_func_ids: []
module: auth
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_004_001_forgot_password.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, P1, security]
source_refs: [POST /api/auth/forgot-password, backend/app/api/auth.py::forgot_password]
evidence_requirements: [200 generic message; reset link captured from log sink for the real user]
```
**Steps:** 1) POST forgot-password for an existing active user.
**Expected Results:** 200 fixed message; reset token minted (bound to current password hash); email/link produced in log sink; `audit user.password_reset_requested`.

---
```yaml
id: TC-AUTH-004-002
title: Reset-password with a valid token sets a new password and enables login
primary_func_id: AUTH-004
related_func_ids: [AUTH-002]
module: auth
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_004_002_reset_password_flow.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integration, auth, P1, regression]
source_refs: [POST /api/auth/reset-password, backend/app/api/auth.py::reset_password]
evidence_requirements: [200; old password login fails; new password login succeeds]
```
**Steps:** 1) Request reset, capture token. 2) POST reset-password with token + new password. 3) Login old (fail) then new (succeed).
**Expected Results:** 200; password changed; `audit user.password_reset`; new password works, old does not.

---
```yaml
id: TC-AUTH-004-003
title: Reset token is single-use — reuse after password change is rejected (data integrity)
primary_func_id: AUTH-004
related_func_ids: []
module: auth
test_level: L2
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_004_003_reset_token_single_use.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, data-integrity, negative, P1]
source_refs: [backend/app/core/security.py::password_fingerprint_matches]
evidence_requirements: [Second use of the same token → 400 invalid_or_expired_token]
```
**Steps:** 1) Reset password with token T (succeeds). 2) Reuse token T.
**Expected Results:** Second use → 400 `invalid_or_expired_token` (fingerprint no longer matches the changed hash).

---
```yaml
id: TC-AUTH-004-004
title: Reset accepts a weaker password than registration allows — DEFECT CONFIRM (policy asymmetry)
primary_func_id: AUTH-004
related_func_ids: [AUTH-001]
module: auth
test_level: L2
test_type: Security
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_004_004_reset_policy_asymmetry.spec.ts
owner: unassigned
status: Draft
defect_status: Confirmed (DEF-AUTH-002)
last_reviewed: 2026-07-30
tags: [api, auth, security, boundary, P1]
source_refs:
  - backend/app/schemas/auth.py::ResetPasswordIn (min_length=8,max_length=128, no strength check)
  - baseline §27 (Medium finding — policy asymmetry)
evidence_requirements: [Reset succeeds with an 8-char all-lowercase password that registration rejects]
```
**Steps:** 1) Reset with an 8-char all-lowercase password (no complexity). 2) Compare to TC-AUTH-001-006 sub-case 3 (register rejects it).
**Expected Results (current):** reset **succeeds** (200), confirming weaker-than-registration policy; also test a 73–128 char password (registration caps at 72). `defect_status: Potential` — **do NOT file yet**; if reproduced **twice** in QA, file per DEFECT_MANAGEMENT_PROCESS §7; if not reproduced or env/data-caused, classify and update Expected Result + VERIFICATION_NOTES.

---
```yaml
id: TC-AUTH-004-005
title: Forgot-password for a non-existent email still returns 200 (no enumeration)
primary_func_id: AUTH-004
related_func_ids: []
module: auth
test_level: L2
test_type: Negative
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_004_005_forgot_unknown_email.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, security, P2]
source_refs: [backend/app/api/auth.py::forgot_password]
evidence_requirements: [200 identical generic message; no email queued]
```
**Steps:** 1) POST forgot-password for an unregistered email.
**Expected Results:** 200 identical message; no reset email produced.

---
```yaml
id: TC-AUTH-004-006
title: Forgot-password email case-sensitivity — DEFECT CONFIRM (mixed-case silently no-match)
primary_func_id: AUTH-004
related_func_ids: []
module: auth
test_level: L2
test_type: Negative
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_004_006_forgot_email_case.spec.ts
owner: unassigned
status: Draft
defect_status: Confirmed (DEF-AUTH-003)
last_reviewed: 2026-07-30
tags: [api, auth, negative, data-integrity, P2]
source_refs:
  - backend/app/schemas/auth.py::ForgotPasswordIn (no _normalize_email)
  - baseline §27 (Medium finding — email not normalized)
evidence_requirements: [Mixed-case email produces 200 but no reset link is generated for the real (lowercased) user]
```
**Preconditions:** User registered as `qa+case-<runid>@kopyya.test`.
**Steps:** 1) POST forgot-password with `QA+Case-<runid>@Kopyya.TEST` (mixed case).
**Expected Results (current):** 200 generic message but **no reset link generated** (lookup misses the lowercased row). `defect_status: Potential` — **do NOT file yet**; reproduce **twice** in QA before filing (§7). If it does reproduce, note it's masked by anti-enumeration; if not reproduced or env/data-caused, classify accordingly and update Expected Result + VERIFICATION_NOTES.
```
