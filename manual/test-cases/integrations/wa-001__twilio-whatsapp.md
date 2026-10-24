# WA-001 — WhatsApp rejected-trade alerts (Twilio)

Parent **WA-001**, with **SMS-001** (shared phone, independent preference) and **ADMIN-003** (rejected-trade view).
Source: `backend/app/api/auth.py` (`whatsapp_notifications_enabled` + `whatsapp_opt_in_at` on PATCH /me),
`backend/app/services/rejected_trade_sms.py` (`WA_CATEGORY`, `whatsapp_variables`), `backend/app/services/sms_outbox.py`
(`whatsapp_opt_in_problem`), `backend/app/services/sms.py::send_whatsapp_detailed`, `backend/app/api/admin.py`
(`whatsapp` per rejection), `frontend/components/settings/SmsNotificationsForm.tsx`.

**Environment:** `[local-qa]`, `REJECTED_TRADE_WHATSAPP_ENABLED` off (default) and Twilio creds blank — NO real
WhatsApp message is sent. Sending with the flag on is covered by the app's unit tests with a mocked Twilio.
**Never production. Never a real phone.**

---
```yaml
id: TC-WA-001-001
title: WhatsApp opt-in needs a phone, records consent, clears it on opt-out and leaves SMS alone
primary_func_id: WA-001
related_func_ids: [SMS-001]
module: integrations
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-WA-001-001)
owner: unassigned
status: Draft
last_reviewed: 2026-10-23
tags: [api, integrations, whatsapp, P1]
source_refs: [PATCH /api/auth/me whatsapp_notifications_enabled]
evidence_requirements: [No phone → 422 whatsapp_needs_phone; opt-in sets whatsapp_opt_in_at; opt-out nulls it; sms_notifications_enabled unchanged]
```
**Steps:** 1) Opt in without a phone. 2) Set a phone (SMS off), opt in. 3) Opt out.
**Expected Results:** Refused without a phone; consent time recorded on opt-in and cleared on opt-out; SMS preference untouched.

---
```yaml
id: TC-WA-001-002
title: Changing the phone number withdraws WhatsApp consent
primary_func_id: WA-001
related_func_ids: []
module: integrations
test_level: L2
test_type: Security
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-WA-001-002)
owner: unassigned
status: Draft
last_reviewed: 2026-10-23
tags: [api, integrations, whatsapp, P1]
source_refs: [backend/app/api/auth.py::update_me (phone change resets WhatsApp opt-in)]
evidence_requirements: [After a phone change, whatsapp_notifications_enabled false and whatsapp_opt_in_at null]
```
**Steps:** 1) Opt in with a phone. 2) Change the phone.
**Expected Results:** WhatsApp is off until the user opts in again for the new number.

---
```yaml
id: TC-WA-001-003
title: With WhatsApp off (the default) a rejection records no WhatsApp message
primary_func_id: WA-001
related_func_ids: [ADMIN-003]
module: integrations
test_level: L3
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/comms/comms.spec.ts (TC-WA-001-003)
owner: unassigned
status: Draft
last_reviewed: 2026-10-23
tags: [api, integrations, whatsapp, P1]
source_refs: [GET /api/admin/rejected-orders (whatsapp, whatsapp_tracking_enabled)]
evidence_requirements: [An opted-in subscriber's rejected mirror shows whatsapp null; whatsapp_tracking_enabled false]
```
**Steps:** 1) Opted-in subscriber's mirror is rejected by the mock broker. 2) Admin lists rejected orders.
**Expected Results:** Nothing recorded or sent while the server flag is off.
