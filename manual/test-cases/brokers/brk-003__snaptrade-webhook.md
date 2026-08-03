# SnapTrade webhook (Stage 3, BRK-003)

Parent **BRK-003**. Endpoint `POST /api/brokers/snaptrade/webhook` (**unauthenticated**). Source:
`backend/app/api/brokers.py::snaptrade_webhook`, `backend/app/services/snaptrade_listener.py::poll_now_for_trader`.
Baseline §15.3 / §27 (unauthenticated webhook, no signature verification).

**Environment:** `[local-qa]`. The webhook endpoint requires no broker creds to exercise, so these are
directly testable. `@destructive` where a poll is scheduled. **Never production.**

---
```yaml
id: TC-BRK-003-001
title: Valid webhook (parseable userId) schedules a background poll for that trader
primary_func_id: BRK-003
related_func_ids: [JOB-003]
module: brokers
test_level: L3
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-003-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, webhook, destructive, P1]
source_refs: [backend/app/api/brokers.py::snaptrade_webhook (valid UUID → BackgroundTask poll_now_for_trader)]
evidence_requirements: [200 {ok:true}; a background poll is scheduled for the resolved trader user id]
```
**Steps:** 1) POST webhook with a body containing a valid `userId` (UUID) for a connected trader.
**Expected Results:** 200 `{ok:true}`; `poll_now_for_trader` scheduled; detected orders dedupe against existing (no injection).

---
```yaml
id: TC-BRK-003-002
title: Unauthenticated webhook + forged poll-amplification — Potential security finding
primary_func_id: BRK-003
related_func_ids: [SEC-003]
module: brokers
test_level: L3
test_type: Security
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
defect_status: Potential
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-003-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, webhook, security, destructive, P1]
source_refs: [backend/app/api/brokers.py::snaptrade_webhook (no auth, no signature verification — TODO), baseline §15.3/§27]
evidence_requirements: [Unauthenticated caller can invoke the webhook; repeated forged calls schedule repeated polls (amplification). No rate-limit observed.]
```
**Steps:** 1) POST the webhook with **no authentication**. 2) Repeat forged calls with a valid trader userId.
**Expected Results (observed):** The endpoint accepts unauthenticated calls and schedules polls; no signature verification, no rate-limit. **`defect_status: Potential`** — a forged call can only trigger a real poll (deduped by `broker_order_id`), so it cannot inject trades, but it is an unauthenticated amplification surface. **Keep Potential until reproduced twice and reviewed** per DEFECT_MANAGEMENT_PROCESS §7; do NOT file as Confirmed here.

---
```yaml
id: TC-BRK-003-003
title: Invalid / missing / non-UUID userId payloads are acked with no action
primary_func_id: BRK-003
related_func_ids: []
module: brokers
test_level: L2
test_type: Negative
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-003-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, snaptrade, webhook, negative, P2]
source_refs: [backend/app/api/brokers.py::snaptrade_webhook (unparseable body → {}; no/invalid userId → {ok:true}, no poll)]
evidence_requirements: [Unparseable body, missing userId, and non-UUID userId all return 200 {ok:true} with NO poll scheduled]
```
**Steps (data-driven):** 1) Malformed JSON. 2) Body with no `userId`. 3) `userId` = non-UUID string.
**Expected Results:** 200 `{ok:true}` in all cases; no background poll scheduled (test ping / bad input safely ignored).
