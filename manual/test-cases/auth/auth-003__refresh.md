# AUTH-003 — Refresh token

Parent: **AUTH-003**. Endpoint: `POST /api/auth/refresh` (refresh token in **body**).
Source: `backend/app/api/auth.py::refresh`, `backend/app/core/security.py::decode_token`.

---
```yaml
id: TC-AUTH-003-001
title: Valid refresh token returns a new access + refresh pair
primary_func_id: AUTH-003
related_func_ids: [AUTH-002]
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
automation_ref: automation/api/tests/auth/test_tc_auth_003_001_refresh_valid.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, P1, regression]
source_refs: [POST /api/auth/refresh, backend/app/api/auth.py::refresh]
evidence_requirements: [200 TokenPair; new access token valid]
```
**Preconditions:** Valid refresh token from a prior login.
**Steps:** 1) POST refresh with `{refresh_token}` in the body.
**Expected Results:** 200; new `TokenPair`; new access token authenticates a protected GET.

---
```yaml
id: TC-AUTH-003-002
title: Malformed/non-UUID sub in refresh token — DEFECT CONFIRM (currently 500, expected 401)
primary_func_id: AUTH-003
related_func_ids: []
module: auth
test_level: L2
test_type: Negative
priority: P1
risk: High
defect_status: Confirmed (DEF-AUTH-001)
environment: [local-qa]   # isolated env + dedicated QA-only JWT secret; never prod
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_003_002_refresh_malformed_sub.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, security, P1]
source_refs:
  - backend/app/api/auth.py::refresh (payload["sub"] + uuid.UUID unguarded)
  - baseline PROJECT_FUNCTIONALITY_DOCUMENT.pdf §27 (Medium finding)
evidence_requirements: [Observed status code + body; note 500 vs expected 401]
```
**Preconditions:** Isolated local/fake env with a dedicated QA-only JWT secret. Mint a refresh token whose `sub` is missing or non-UUID (`common/jwt.mintMalformedSub`). **Never run against production.**
**Steps:** 1) POST refresh with the malformed token.
**Expected Results (intended):** 401 (invalid token). **Known/Potential defect (baseline §27):** currently returns **HTTP 500**. `defect_status: Potential` — **do NOT file a Confirmed Defect**; if reproduced **twice** in QA, file per DEFECT_MANAGEMENT_PROCESS §7; if not reproduced, update this Expected Result + VERIFICATION_NOTES. Test records the observed status code.

---
```yaml
id: TC-AUTH-003-003
title: Wrong token type (access presented as refresh) returns 401 wrong_token_type
primary_func_id: AUTH-003
related_func_ids: []
module: auth
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa]   # minted token — isolated env, QA-only secret; never prod
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_003_003_refresh_wrong_type.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, P1]
source_refs: [backend/app/api/auth.py::refresh (type check)]
evidence_requirements: [401 wrong_token_type]
```
**Steps:** 1) POST refresh with a valid **access** token in the body.
**Expected Results:** 401 `wrong_token_type`.

---
```yaml
id: TC-AUTH-003-004
title: Expired refresh token returns 401
primary_func_id: AUTH-003
related_func_ids: []
module: auth
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]   # minted token — isolated env, QA-only secret; never prod
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_003_004_refresh_expired.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, negative, boundary, P1]
source_refs: [backend/app/core/security.py::decode_token]
evidence_requirements: [401 invalid_token for expired]
```
**Preconditions:** Mint an already-expired refresh token (QA secret).
**Steps:** 1) POST refresh with the expired token.
**Expected Results:** 401 `invalid_token`.

---
```yaml
id: TC-AUTH-003-005
title: Old refresh token remains valid after rotation (no revocation) — security note
primary_func_id: AUTH-003
related_func_ids: []
module: auth
test_level: L2
test_type: Security
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/auth/test_tc_auth_003_005_refresh_no_revocation.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, auth, security, P2]
source_refs:
  - backend/app/api/auth.py::refresh (no jti/blacklist)
  - baseline §8 (no refresh-token rotation/revocation)
evidence_requirements: [Old refresh token still returns 200 after a new pair was issued]
```
**Steps:** 1) Refresh once (get pair B). 2) Refresh again using the ORIGINAL refresh token.
**Expected Results:** Original token still works (documents the no-revocation gap). Flag as a security observation, not a hard fail unless policy changes.
```
