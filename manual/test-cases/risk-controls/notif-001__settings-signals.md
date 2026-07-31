# Risk-control notifications & SMS eligibility (maps to NOTIF-001 / SMS-001)

Signals emitted when risk controls fire. Maps to **NOTIF-001** (SSE + in-app) and **SMS-001** (Twilio
A2P eligibility). Source: `backend/app/services/events.py`, `backend/app/services/notifications.py`
(`create_notification`, `_SMS_PREF_EXACT`/`_SMS_PREF_PREFIX`), `backend/app/services/pnl_poller.py`,
`backend/app/api/events.py` (SSE).

**Environment:** `[local-qa]` fake broker; SendGrid/Twilio in **log/sink mode** (no external send). `@destructive`.

---
```yaml
id: TC-NOTIF-001-001
title: Auto-pause / auto-liquidation emit SSE events (copy.auto_paused / copy.auto_liquidated, pnl.tick)
primary_func_id: NOTIF-001
related_func_ids: [RISK-001, RISK-002]
module: notifications
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_001_sse_risk_events.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sse, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/events.py::publish, backend/app/api/events.py (SSE), pnl_poller.py]
evidence_requirements: [SSE stream (via ?token=) delivers copy.auto_paused / copy.auto_liquidated / pnl.tick after the trigger; lossy-by-design if Redis down]
```
**Steps:** 1) Open the SSE stream for the subscriber. 2) Trigger a daily-limit pause (RISK-001-007) and a liquidation (RISK-002-002).
**Expected Results:** Corresponding SSE events received after commit. (These event types are handled via `as any` in the frontend union — baseline FE contract gap; note but do not fail.)

---
```yaml
id: TC-NOTIF-001-002
title: In-app notification is created on risk auto-actions
primary_func_id: NOTIF-001
related_func_ids: [RISK-001, RISK-002]
module: notifications
test_level: L3
test_type: Integration
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_notif_001_002_inapp_notification.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/notifications.py::create_notification; GET /api/notifications]
evidence_requirements: [A notification row is created and visible via GET /api/notifications after an auto-pause/liquidation]
```
**Steps:** 1) Trigger auto-pause. 2) GET /api/notifications for the subscriber.
**Expected Results:** An in-app notification exists for the auto-action (type + message + metadata), scoped to the subscriber.

---
```yaml
id: TC-SMS-001-001
title: SMS eligibility — only A2P-registered categories text; unregistered types never send
primary_func_id: SMS-001
related_func_ids: [RISK-001]
module: notifications
test_level: L3
test_type: Data-Integrity
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_sms_001_001_sms_eligibility.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, notifications, sms, data-integrity, destructive, requires-fake-broker, P2]
source_refs: [backend/app/services/notifications.py (_SMS_PREF_EXACT/_SMS_PREF_PREFIX, A2P gating), services/sms.py (log mode when creds blank)]
evidence_requirements: [With SMS enabled + auto-action category registered → SMS attempted (log sink); a non-registered type → NO SMS even if SMS enabled]
```
**Preconditions:** Subscriber with `sms_notifications_enabled=true` + relevant per-type flag; phone set; Twilio in log/sink mode.
**Steps:** 1) Trigger an auto-action whose category IS in the SMS pref map. 2) Trigger a notification type NOT in the map.
**Expected Results:** Registered category → SMS attempted (captured in log/sink, never a real send in QA); unregistered type → no SMS. Disabling `sms_notifications_enabled` suppresses all SMS.
```
