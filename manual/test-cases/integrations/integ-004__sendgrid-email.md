# INTEG-004 — SendGrid email

Parent **INTEG-004** (SendGrid), with **AUTH-001/004/005** and **FOLLOW-001** flows. Source:
`backend/app/services/email.py` (httpx to SendGrid v3, log mode when key blank, dynamic templates vs
inline HTML, 10s timeout), `backend/app/api/auth.py` (verification/reset/change background tasks),
`backend/app/api/follow_requests.py` (follow emails), `backend/app/config.py`
(`SENDGRID_API_KEY`, `EMAIL_FROM`/`SENDGRID_FROM_EMAIL`, template IDs, `FRONTEND_BASE_URL`, token TTLs).

**Environment:** `[local-qa]` with **SendGrid in log mode** (blank key) — link/body logged, NO external send.
`@destructive` where it creates users/state. **Never production. No production SendGrid credentials in QA.**

---
```yaml
id: TC-INTEG-004-001
title: Registration queues a verification email (logged in QA)
primary_func_id: INTEG-004
related_func_ids: [AUTH-001, AUTH-005]
module: integrations
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_001_register_email.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, destructive, requires-seed, P1]
source_refs: [backend/app/api/auth.py::register (BackgroundTask send_verification_email), backend/app/services/email.py]
evidence_requirements: [Registration produces a verification email/link in the log sink; token type=verify with eml claim]
```
**Steps:** 1) Register a synthetic user. 2) Capture the email/link from the sink.
**Expected Results:** Verification email produced (log mode); link contains a valid verify token.

---
```yaml
id: TC-INTEG-004-002
title: Resend verification produces a fresh email (anti-enumeration)
primary_func_id: INTEG-004
related_func_ids: [AUTH-005]
module: integrations
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_002_resend.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, P2]
source_refs: [POST /api/auth/resend-verification (always 200; sends only if unverified)]
evidence_requirements: [Unverified user → new email logged; already-verified/unknown email → 200 but no send]
```
**Steps:** 1) Resend for an unverified user, a verified user, and an unknown email.
**Expected Results:** Only the unverified case produces an email; all return 200 (anti-enumeration).

---
```yaml
id: TC-INTEG-004-003
title: Password-reset email contains a valid, bound reset link
primary_func_id: INTEG-004
related_func_ids: [AUTH-004]
module: integrations
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_003_reset_email.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, P1]
source_refs: [POST /api/auth/forgot-password (BackgroundTask send_password_reset_email)]
evidence_requirements: [Reset email/link logged for a real user; link resolves to the reset flow with a token bound to the current password hash]
```
**Steps:** 1) Forgot-password for a real user. 2) Capture link.
**Expected Results:** Reset email produced; link token single-use (bound to current hash — see TC-AUTH-004-003).

---
```yaml
id: TC-INTEG-004-004
title: Email-change confirmation to new address + notification to old address
primary_func_id: INTEG-004
related_func_ids: [AUTH-005]
module: integrations
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_004_email_change.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, P1]
source_refs: [POST /api/auth/change-email (send_email_change_verification to new + send_email_change_notice to old)]
evidence_requirements: [Two emails logged: confirmation to the new address, notice to the old address]
```
**Steps:** 1) Request email change.
**Expected Results:** New-address confirmation + old-address notice both logged (dual notification).

---
```yaml
id: TC-INTEG-004-005
title: Follow request / approval / decision emails
primary_func_id: INTEG-004
related_func_ids: [FOLLOW-001]
module: integrations
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_005_follow_emails.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, follow, P2]
source_refs: [backend/app/api/follow_requests.py (send_follow_request_email, send_follow_decision_email — best-effort background)]
evidence_requirements: [Follow request → trader email; approve/reject → subscriber email (best-effort, off the request path)]
```
**Steps:** 1) Create a follow request; approve/reject it.
**Expected Results:** Corresponding emails logged (best-effort; failures don't block the request/decision).

---
```yaml
id: TC-INTEG-004-006
title: SendGrid credentials missing → log mode (link logged, returns False, never raises)
primary_func_id: INTEG-004
related_func_ids: []
module: integrations
test_level: L2
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_006_no_creds.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, recovery, P1]
source_refs: [backend/app/services/email.py (blank SENDGRID_API_KEY → log message + reset link at WARNING, return False, never raise)]
evidence_requirements: [Blank key → email + link logged; returns False; no external call; core flow unaffected]
```
**Steps:** 1) Blank SendGrid key. 2) Trigger any email.
**Expected Results:** Message + link logged (sink); no send; never raises. This IS the QA capture mechanism.

---
```yaml
id: TC-INTEG-004-007
title: Dynamic template configured vs missing (template path vs inline HTML fallback)
primary_func_id: INTEG-004
related_func_ids: []
module: integrations
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_007_templates.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, P2]
source_refs: [backend/app/services/email.py (SENDGRID_PASSWORD_RESET_TEMPLATE_ID / VERIFICATION_TEMPLATE_ID → dynamic template with handlebars data; blank → inline HTML)]
evidence_requirements: [Template ID set → dynamic-template payload with {{reset_link}}/{{verify_link}} data; blank → inline HTML payload]
```
**Steps (data-driven):** template ID set vs blank for reset + verification.
**Expected Results:** Correct payload shape each way; inline HTML fallback when no template.

---
```yaml
id: TC-INTEG-004-008
title: From-address selection honors EMAIL_FROM / SENDGRID_FROM_EMAIL alias
primary_func_id: INTEG-004
related_func_ids: []
module: integrations
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_008_from_address.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, P2]
source_refs: [backend/app/config.py (EMAIL_FROM AliasChoices sendgrid_from_email; default noreply@kopyya.com; EMAIL_FROM_NAME)]
evidence_requirements: [From = configured EMAIL_FROM/SENDGRID_FROM_EMAIL with display name; default noreply@kopyya.com]
```
**Steps (data-driven):** set via EMAIL_FROM; via SENDGRID_FROM_EMAIL; neither (default).
**Expected Results:** From address + display name resolved from either env name; default applied when unset.

---
```yaml
id: TC-INTEG-004-009
title: SendGrid timeout / 4xx / 5xx never roll back the core transaction
primary_func_id: INTEG-004
related_func_ids: [AUTH-001, AUTH-004]
module: integrations
test_level: L3
test_type: Recovery
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_009_failure_isolation.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, recovery, destructive, requires-seed, P0]
source_refs: [backend/app/services/email.py (httpx 10s timeout; never raises — best-effort BackgroundTask)]
evidence_requirements: [SendGrid timeout/4xx/5xx → email fails silently; register/reset/change still succeed and commit]
```
**Steps (data-driven):** simulate SendGrid timeout/403/5xx during registration and password reset.
**Expected Results:** The user is created / reset requested regardless; email failure is isolated (background task, never raises). Email-failure-must-not-roll-back guard (P0).

---
```yaml
id: TC-INTEG-004-010
title: Duplicate-email prevention — one email per trigger, idempotent flows
primary_func_id: INTEG-004
related_func_ids: [AUTH-005]
module: integrations
test_level: L2
test_type: Data-Integrity
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_010_dedup.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, data-integrity, P2]
source_refs: [backend/app/api/auth.py (verify idempotent; create_follow_request approved pair no dup email)]
evidence_requirements: [Idempotent flows (verify already-verified, re-request approved follow) do not send duplicate emails]
```
**Steps:** 1) Verify an already-verified account; re-request an already-approved follow.
**Expected Results:** No duplicate email for idempotent/no-op operations.

---
```yaml
id: TC-INTEG-004-011
title: Email-address case handling + anti-enumeration (reset/resend)
primary_func_id: INTEG-004
related_func_ids: [AUTH-004]
module: integrations
test_level: L2
test_type: Negative
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_011_case_enumeration.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, negative, P2]
source_refs: [backend/app/schemas/auth.py (ForgotPasswordIn/ResendVerificationIn NOT normalized — baseline §27), anti-enumeration]
evidence_requirements: [Unknown email → 200 no send; mixed-case email on forgot-password → 200 but NO email (case gap) — cross-ref TC-AUTH-004-006 Potential]
```
**Steps:** 1) forgot-password with unknown email → 200 no email. 2) mixed-case of a real email → 200 but no email (baseline case gap).
**Expected Results:** Anti-enumeration (uniform 200); mixed-case no-match is the documented Potential (TC-AUTH-004-006) — keep Potential.

---
```yaml
id: TC-INTEG-004-012
title: Reset/verify tokens are redacted in logs and captured evidence
primary_func_id: INTEG-004
related_func_ids: [SEC-001]
module: integrations
test_level: L2
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_012_token_redaction.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, security, P0]
source_refs: [backend/app/services/email.py (logs link in log mode), automation/common/redaction.ts]
evidence_requirements: [When captured as evidence, reset/verify tokens are masked; the SendGrid API key never appears]
```
**Steps:** 1) Capture email logs as evidence.
**Expected Results:** Tokens masked in stored evidence; API key never logged. (Log-mode logs the link for QA use; evidence is redacted before storage.) Token/credential-leak guard (P0).

---
```yaml
id: TC-INTEG-004-013
title: Link correctness uses FRONTEND_BASE_URL for the environment
primary_func_id: INTEG-004
related_func_ids: []
module: integrations
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_013_link_base_url.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, P2]
source_refs: [backend/app/config.py (FRONTEND_BASE_URL), backend/app/services/email.py (link building)]
evidence_requirements: [Reset/verify/change links use FRONTEND_BASE_URL as the origin and the correct route + token query]
```
**Steps:** 1) Set FRONTEND_BASE_URL for QA. 2) Trigger a reset.
**Expected Results:** Link origin = FRONTEND_BASE_URL; correct path (`/reset-password?token=` etc.).

---
```yaml
id: TC-INTEG-004-014
title: Expired-link handling — reset/verify tokens past TTL are rejected
primary_func_id: INTEG-004
related_func_ids: [AUTH-004, AUTH-005]
module: integrations
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_014_expired_link.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, boundary, P1]
source_refs: [backend/app/config.py (PASSWORD_RESET_TOKEN_MINUTES=30, EMAIL_VERIFICATION_TOKEN_MINUTES=1440), core/security decode]
evidence_requirements: [A reset token >30m or a verify token >24h → 400 invalid_or_expired_token]
```
**Steps (time-controlled):** use a reset link after 30m; a verify link after 24h.
**Expected Results:** 400 invalid/expired; a fresh link works.

---
```yaml
id: TC-INTEG-004-015
title: No production SendGrid credentials in local QA; local capture/mock is the mechanism
primary_func_id: INTEG-004
related_func_ids: [SEC-001]
module: integrations
test_level: L2
test_type: Security
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_015_no_prod_creds.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, security, P1]
source_refs: [docs/TEST_DATA_STRATEGY.md, docs/ENVIRONMENT_GUIDE.md (names-only env; blank SendGrid → log mode)]
evidence_requirements: [Local/QA runs use blank or a QA-only SendGrid key; no production key present; emails captured via log sink]
```
**Steps:** 1) Verify the QA config has no production SendGrid key. 2) Confirm emails are captured, not sent.
**Expected Results:** No production credentials in QA; log-mode/sink capture is the verification path (no real emails sent).

---
```yaml
id: TC-INTEG-004-016
title: Email retry behavior — not implemented (best-effort), documented
primary_func_id: INTEG-004
related_func_ids: []
module: integrations
test_level: L2
test_type: Negative
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_integ_004_016_no_retry.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, email, negative, P2]
source_refs: [backend/app/services/email.py (single attempt; returns False on failure; no retry queue)]
evidence_requirements: [A failed email is not retried by the app (best-effort); user can re-trigger (resend verification / re-request reset)]
```
**Steps:** 1) Fail an email send once.
**Expected Results:** No automatic retry (documented); user-initiated resend is the recovery path. Not a defect unless product requires retry.
