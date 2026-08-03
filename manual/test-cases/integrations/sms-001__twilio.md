# SMS-001 — Twilio SMS notifications

Parent **SMS-001** (continues at 002), with **AUTH-005** (phone) and **ADMIN-005** (test-SMS tool).
Source: `backend/app/services/sms.py` (compose, send; log mode when creds blank),
`backend/app/services/notifications.py` (`_SMS_PREF_EXACT`/`_SMS_PREF_PREFIX` A2P gating, daemon-thread send),
`backend/app/api/auth.py` (phone + SMS prefs on PATCH /me), `backend/app/api/admin.py::test_sms`,
`backend/app/config.py` (`TWILIO_*`).

**Environment:** `[local-qa]` with **Twilio in log/sink mode** (blank creds) — NO real SMS sent. `@destructive`
where orders/auto-actions are triggered. **Never production. Never a real phone.**

---
```yaml
id: TC-SMS-001-002
title: Valid E.164 phone is accepted and stored on the profile
primary_func_id: SMS-001
related_func_ids: [AUTH-005]
module: integrations
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-SMS-001-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integrations, sms, P2]
source_refs: [PATCH /api/auth/me (phone ≤20, E.164 normalized), backend/app/schemas/auth.py::_normalize_phone]
evidence_requirements: [Valid E.164 stored normalized; sms_notifications_enabled defaults from bool(phone) at register]
```
**Steps:** 1) PATCH /me with `+15551234567`.
**Expected Results:** Stored in E.164; profile reflects it.

---
```yaml
id: TC-SMS-001-003
title: Invalid E.164 number is rejected (422)
primary_func_id: SMS-001
related_func_ids: [AUTH-005]
module: integrations
test_level: L2
test_type: Negative
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-SMS-001-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integrations, sms, negative, P2]
source_refs: [backend/app/schemas/auth.py::_normalize_phone (rejects bad format → 422)]
evidence_requirements: [Malformed numbers → 422; server-side normalization is authoritative (client regex bypassable)]
```
**Steps (data-driven):** `12345`, `+0123`, `abc`, `++1555...`.
**Expected Results:** 422 each; not stored (server enforces even if the client regex is bypassed).

---
```yaml
id: TC-SMS-001-004
title: Consent required and revocable — sms_notifications_enabled master switch gates all SMS
primary_func_id: SMS-001
related_func_ids: [AUTH-005]
module: integrations
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-SMS-001-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/auth.py (sms_notifications_enabled), backend/app/services/notifications.py (master switch gate)]
evidence_requirements: [Enabled + phone → eligible types attempt SMS; revoked (false) → NO SMS for any type]
```
**Steps:** 1) Enable consent, trigger an eligible auto-action → SMS attempted (sink). 2) Revoke consent, trigger again → no SMS.
**Expected Results:** Consent master switch gates all SMS; revocation stops all.

---
```yaml
id: TC-SMS-001-005
title: Per-category enable/disable and A2P eligibility
primary_func_id: SMS-001
related_func_ids: []
module: integrations
test_level: L3
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_sms_001_005_categories.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/notifications.py (_SMS_PREF_EXACT/_SMS_PREF_PREFIX; types absent → NEVER send), user flags sms_on_auto_actions/sms_on_trade_rejected/sms_on_broker_connection]
evidence_requirements: [Only registered A2P categories with their per-type flag on send SMS; an unmapped type never sends even with consent+flags]
```
**Steps:** 1) Toggle each category flag; trigger the matching event.
**Expected Results:** Only mapped categories with the flag on attempt SMS; unmapped types never send (A2P 10DLC compliance).

---
```yaml
id: TC-SMS-001-006
title: Broker-disconnect / trade-rejected / auto-liquidation alerts fire SMS when eligible
primary_func_id: SMS-001
related_func_ids: [RISK-002, BRK-001, TRADE-001]
module: integrations
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-SMS-001-006)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/notifications.py (category maps), sms.py]
evidence_requirements: [Each eligible alert composes and attempts an SMS (sink) with the brand prefix + STOP opt-out]
```
**Steps (data-driven):** trigger broker-connection change, trade rejection, auto-liquidation with the matching flags on.
**Expected Results:** SMS composed (sink capture) for each eligible category; message carries brand prefix + STOP (10DLC).

---
```yaml
id: TC-SMS-001-007
title: Twilio credentials missing → log mode (no send, no error)
primary_func_id: SMS-001
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
automation_ref: automation/integration/test_tc_sms_001_007_no_creds.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, recovery, P1]
source_refs: [backend/app/services/sms.py (blank SID/token → log at WARNING, return False; no sender → log ERROR, no-op)]
evidence_requirements: [Blank TWILIO_ACCOUNT_SID/AUTH_TOKEN → message logged, returns False, no external call, never raises]
```
**Steps:** 1) Blank Twilio creds. 2) Trigger an eligible SMS.
**Expected Results:** Logged (sink), no send, no exception (dev/QA stays functional).

---
```yaml
id: TC-SMS-001-008
title: Messaging Service SID path vs From-number fallback
primary_func_id: SMS-001
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
automation_ref: automation/integration/test_tc_sms_001_008_sender_selection.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, P2]
source_refs: [backend/app/config.py (TWILIO_MESSAGING_SERVICE_SID preferred, else TWILIO_FROM_NUMBER), sms.py]
evidence_requirements: [With MG SID set → messaging-service path; without → from-number; neither → cannot send (logged)]
```
**Steps (data-driven):** MG SID set; only from-number; neither.
**Expected Results:** Correct sender chosen; neither → no send (logged error).

---
```yaml
id: TC-SMS-001-009
title: Twilio timeout / 4xx / 5xx never fail the core transaction
primary_func_id: SMS-001
related_func_ids: [TRADE-001, RISK-001]
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
automation_ref: automation/integration/test_tc_sms_001_009_failure_isolation.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, recovery, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/sms.py (httpx 10s timeout; never raises), notifications.py (SMS on daemon thread; failure caught+logged)]
evidence_requirements: [Twilio timeout/4xx/5xx → SMS fails silently on a daemon thread; the triggering financial action (order/pause/liquidation) still completes]
```
**Steps (data-driven):** simulate Twilio timeout, 4xx, 5xx during an order rejection / auto-liquidation notification.
**Expected Results:** The core action completes and commits; SMS failure is isolated (daemon thread, caught+logged), never rolls back. SMS-failure-must-not-roll-back-financial guard (P0).

---
```yaml
id: TC-SMS-001-010
title: Duplicate-SMS prevention (one SMS per notification event)
primary_func_id: SMS-001
related_func_ids: [NOTIF-001]
module: integrations
test_level: L3
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_sms_001_010_dedup.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/notifications.py (SMS fanout tied 1:1 to a created notification; dedup markers upstream)]
evidence_requirements: [One notification event → at most one SMS attempt; upstream dedup (e.g. bracket.trader_notified) prevents repeats]
```
**Steps:** 1) Trigger an event that could fire twice (OCO fill).
**Expected Results:** One SMS attempt (tied to the single notification; upstream markers dedupe).

---
```yaml
id: TC-SMS-001-011
title: Phone update — the old number stops receiving messages
primary_func_id: SMS-001
related_func_ids: [AUTH-005]
module: integrations
test_level: L2
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/integrations/test_tc_sms_001_011_phone_update.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integrations, sms, data-integrity, P1]
source_refs: [PATCH /api/auth/me (phone), backend/app/services/sms.py (sends to current stored phone)]
evidence_requirements: [After a phone change, SMS goes to the new number only; the old number is never targeted]
```
**Steps:** 1) Set phone A. 2) Change to phone B. 3) Trigger an SMS.
**Expected Results:** SMS targets B (sink shows B); A no longer receives.

---
```yaml
id: TC-SMS-001-012
title: No consent / no phone → no SMS attempted
primary_func_id: SMS-001
related_func_ids: []
module: integrations
test_level: L3
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_sms_001_012_no_consent_no_phone.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/notifications.py (requires consent + phone)]
evidence_requirements: [User with consent off OR no phone → no SMS attempt for any event]
```
**Steps:** 1) Consent off (with phone). 2) Consent on but no phone.
**Expected Results:** No SMS in either case.

---
```yaml
id: TC-SMS-001-013
title: Cross-user phone protection — a user can only set their own phone/SMS prefs
primary_func_id: SMS-001
related_func_ids: [AUTHZ-001]
module: integrations
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/integrations/test_tc_sms_001_013_cross_user_phone.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integrations, sms, permission, security, P0]
source_refs: [PATCH /api/auth/me (self-scoped from current_user; no user_id param)]
evidence_requirements: [Phone/SMS prefs are set only on the authenticated user's row; no request shape targets another user]
```
**Steps:** 1) User B updates phone. 2) Confirm A's phone unaffected; no cross-user parameter exists.
**Expected Results:** Self-scoped only. Cross-user-phone-exposure guard (P0).

---
```yaml
id: TC-SMS-001-014
title: Twilio credentials are never exposed in responses/logs (redaction)
primary_func_id: SMS-001
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
automation_ref: automation/api/tests/integrations/test_tc_sms_001_014_twilio_redaction.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integrations, sms, security, P0]
source_refs: [backend/app/config.py (TWILIO_* env, names only), automation/common/redaction.ts]
evidence_requirements: [TWILIO_ACCOUNT_SID/AUTH_TOKEN never appear in API responses, logs, or captured evidence]
```
**Steps:** 1) Exercise SMS paths + admin test-SMS. 2) Inspect responses/logs/evidence.
**Expected Results:** No Twilio SID/token leaks; evidence redacted. Credential-leak guard (P0).

---
```yaml
id: TC-SMS-001-015
title: SMS rate-limiting (not implemented) — documented observation
primary_func_id: SMS-001
related_func_ids: []
module: integrations
test_level: L3
test_type: Negative
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_sms_001_015_rate_limit.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, integrations, sms, negative, P2]
source_refs: [backend/app/services/sms.py / notifications.py (no app-level SMS rate limit; Messaging Service handles carrier-side)]
evidence_requirements: [No app-level SMS rate limit observed; document reliance on Twilio Messaging Service for opt-out/throttling]
```
**Steps:** 1) Trigger many eligible SMS quickly.
**Expected Results:** No app-level throttle (documented); the Messaging Service handles carrier-side opt-out/retries. Record as an observation (not a defect unless a spam vector is proven — then Potential, reproduce twice).

---
```yaml
id: TC-ADMIN-005-001
title: Admin test-SMS endpoint sends a one-off message (admin-only)
primary_func_id: ADMIN-005
related_func_ids: [SMS-001, AUTHZ-001]
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
automation_ref: automation/api/tests/integrations/test_tc_admin_005_001_test_sms.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, integrations, sms, admin, P2]
source_refs: [POST /api/admin/sms/test (require_admin; TestSmsIn to E.164 regex, body 1–320), backend/app/api/admin.py::test_sms]
evidence_requirements: [require_admin (403 otherwise); valid E.164 → send attempted (sink); ok=false with blank creds; body length 1–320]
```
> Mapping note: admin sms/test has no dedicated ADMIN Func ID; mapped to ADMIN-005 (runtime tools) with a recorded gap.
**Steps:** 1) Non-admin → 403. 2) Admin sends a test SMS to a synthetic E.164 (sink).
**Expected Results:** 403 for non-admin; admin send attempted via sink; `ok=false` when creds blank (dev/QA no-op).
