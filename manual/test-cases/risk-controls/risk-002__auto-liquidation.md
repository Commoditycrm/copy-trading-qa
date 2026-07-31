# RISK-002 — Auto-liquidation floor

Parent: **RISK-002**, workflow **WF-14**. Endpoint `PATCH /api/settings/subscriber/auto-liquidation-limit`.
Source: `backend/app/api/settings.py`, `backend/app/services/pnl_poller.py` (equity ≤ floor trigger),
`backend/app/services/auto_liquidator.py`, `backend/app/models/settings.py` (`auto_liquidated_at`).

**Environment:** setting cases `[local-qa, qa]`; enforcement `[local-qa]` fake broker `@destructive`.

---
```yaml
id: TC-RISK-002-001
title: Set auto-liquidation floor and validation boundary (gt=0)
primary_func_id: RISK-002
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Boundary
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/risk/test_tc_risk_002_001_set_floor.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, P1]
source_refs: [PATCH /api/settings/subscriber/auto-liquidation-limit (gt=0)]
evidence_requirements: [200 for >0; 422 for 0/negative; null clears; audit subscriber.auto_liquidation_limit_changed]
```
**Steps:** 1) Set floor=1000; boundaries 0/-1 → 422; null clears.
**Expected Results:** Only >0 accepted; persisted + audited.

---
```yaml
id: TC-RISK-002-002
title: Auto-liquidation triggers when broker equity falls to/below the floor
primary_func_id: RISK-002
related_func_ids: [NOTIF-001]
module: risk-controls
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_002_002_liquidation_trigger.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/pnl_poller.py (equity ≤ floor), auto_liquidator.liquidate_subscriber_account]
evidence_requirements: [copy_enabled=false, auto_liquidated_at set; all cancellable orders cancelled + positions flattened; audit + notification]
```
**Preconditions:** Subscriber with a floor; fake broker equity set ≤ floor.
**Steps:** 1) Poller tick evaluates equity.
**Expected Results:** Copy disabled; `auto_liquidated_at` stamped; `auto_liquidator` cancels orders and market-closes positions (local Order rows persisted); audit + notification.

---
```yaml
id: TC-RISK-002-003
title: Auto-liquidation is sticky — it does NOT auto-resume next day
primary_func_id: RISK-002
related_func_ids: [RISK-001]
module: risk-controls
test_level: L3
test_type: Data-Integrity
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_002_003_sticky_no_resume.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, data-integrity, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py (auto-resume sweep uses pnl_auto_paused_at, NOT auto_liquidated_at)]
evidence_requirements: [After a prior-day liquidation, copy stays disabled the next UTC day (no auto-resume)]
```
**Preconditions:** `auto_liquidated_at` stamped on a prior UTC day (time-controlled).
**Steps:** 1) New-day fanout / poller tick.
**Expected Results:** Copy remains disabled — auto-liquidation is intentionally sticky (only manual re-enable clears it). Contrast RISK-001-009 (daily limits do resume).

---
```yaml
id: TC-RISK-002-004
title: Clearing the floor does not clear a prior auto_liquidated_at marker
primary_func_id: RISK-002
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/risk/test_tc_risk_002_004_clear_floor_keeps_marker.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, data-integrity, P1]
source_refs: [backend/app/api/settings.py::set_auto_liquidation_limit (does not clear auto_liquidated_at)]
evidence_requirements: [Setting floor=null leaves auto_liquidated_at intact; only copy re-enable clears it]
```
**Steps:** 1) Liquidated subscriber. 2) PATCH floor=null.
**Expected Results:** `auto_liquidated_at` unchanged (still liquidated); only re-enabling copy (RISK-001-006) clears it.
```
