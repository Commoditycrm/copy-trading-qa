# AUTH-005 — Email verification & change

Parent: **AUTH-005**. Endpoints: `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`,
`POST /api/auth/change-email`, `POST /api/auth/verify-email-change`.
Source: `backend/app/api/auth.py` (verify_email, resend_verification, change_email, verify_email_change),
`backend/app/core/security.py` (verification/change tokens), `backend/app/services/email.py`, `rate_limit`.

---
```yaml
id: TC-AUTH-005-001
title: Verify-email with a valid token marks the account verified and is idempotent
primary_func_id: AUTH-005
related_func_ids: []
module: auth
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_005_001_verify_email.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, P2, regression]
source_refs: [POST /api/auth/verify-email, backend/app/api/auth.py::verify_email]
evidence_requirements: [email_verified true after first call; second call still 200 (idempotent)]
```
**Steps:** 1) Register, capture verification token. 2) POST verify-email. 3) POST verify-email again.
**Expected Results:** 200; `email_verified=true`, `email_verified_at` set; `audit user.email_verified`; second call idempotent (200, no rewrite).

---
```yaml
id: TC-AUTH-005-002
title: Stale verification token (email since changed) is rejected (400)
primary_func_id: AUTH-005
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
automation_ref: automation/api/tests/auth/email-change.spec.ts (TC-AUTH-005-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, P2]
source_refs: [backend/app/api/auth.py::verify_email (eml claim vs current email)]
evidence_requirements: [400 for token whose eml != current email]
```
**Steps:** 1) Issue verification token for email A. 2) Change email to B (or re-register). 3) Use token A.
**Expected Results:** 400 (stale token).

---
```yaml
id: TC-AUTH-005-003
title: Change-email requires password, notifies both addresses, applies via verify-email-change (integration)
primary_func_id: AUTH-005
related_func_ids: [AUTH-002]
module: auth
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/email-change.spec.ts (TC-AUTH-005-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integration, auth, P2]
source_refs:
  - POST /api/auth/change-email, POST /api/auth/verify-email-change
  - backend/app/api/auth.py::change_email, verify_email_change
evidence_requirements: [Two emails (new confirm + old notice) in sink; email applied only after verify]
```
**Steps:** 1) POST change-email (correct password) to a new address. 2) Confirm two emails (new+old). 3) POST verify-email-change with the token. 4) Login with the new email.
**Expected Results:** email updated to new, `email_verified=true`, `audit user.email_changed`; login works on new email; change not applied until verify.

---
```yaml
id: TC-AUTH-005-004
title: Change-email with wrong password 403; rate-limited after repeats (429)
primary_func_id: AUTH-005
related_func_ids: []
module: auth
test_level: L2
test_type: Negative
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/email-change.spec.ts (TC-AUTH-005-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, recovery, P2]
source_refs: [backend/app/api/auth.py::change_email, rate_limit.email_change_throttled]
evidence_requirements: [403 invalid_password; 429 after >5/hr]
```
**Steps:** 1) POST change-email with wrong password → 403. 2) Repeat past 5/hour → 429.
**Expected Results:** 403 `invalid_password`; then 429 (email-change throttle) + `Retry-After`.

---
```yaml
id: TC-AUTH-005-005
title: Verify-email-change to an address taken by another user is rejected (409) — data integrity
primary_func_id: AUTH-005
related_func_ids: []
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
automation_ref: automation/api/tests/auth/email-change.spec.ts (TC-AUTH-005-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, data-integrity, negative, P2]
source_refs: [backend/app/api/auth.py::verify_email_change (email_taken clash)]
evidence_requirements: [409 email_taken; original email unchanged]
```
**Preconditions:** Two users A and B. A requests change to B's email; B keeps it.
**Steps:** 1) A POST change-email → B's address; capture token. 2) POST verify-email-change.
**Expected Results:** 409 `email_taken`; A's email unchanged (uniqueness preserved).
```
