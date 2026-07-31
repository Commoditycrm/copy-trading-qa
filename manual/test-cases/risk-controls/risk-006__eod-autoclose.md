# RISK-006 — End-of-day 0DTE auto-close & lockout

Parent: **RISK-006**, workflow **WF-16**. Endpoint `PATCH /api/settings/subscriber/eod-autoclose`.
Source: `backend/app/api/settings.py::set_eod_autoclose`, `backend/app/services/eod_autoclose.py`
(worker sweep), `backend/app/services/copy_engine.py` (last-5-minutes same-day-expiry lockout),
`backend/app/services/market_hours.py::in_eod_close_window` (ET). Feature flag `eod_autoclose_enabled`.

**Environment:** setting cases `[local-qa, qa]`; sweep/lockout `[local-qa]` fake broker + **clock control** `@destructive`.

---
```yaml
id: TC-RISK-006-001
title: Set EOD auto-close enabled + minutes with boundary clamp (1–30)
primary_func_id: RISK-006
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Boundary
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-006-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, P2]
source_refs: [PATCH /api/settings/subscriber/eod-autoclose (enabled bool; minutes 1–30, clamped)]
evidence_requirements: [minutes 0/31 → 422 or clamped to 1/30; enabled toggles; audit subscriber.eod_autoclose_changed]
```
**Steps:** 1) Set enabled=true, minutes=15; boundaries minutes=0 and 31 (expect 422 or clamp to 1/30 per handler).
**Expected Results:** Persisted; minutes constrained to 1–30 (handler also re-clamps defensively); audited.

---
```yaml
id: TC-RISK-006-002
title: Final-5-minutes lockout — fanout refuses NEW same-day-expiry (0DTE) subscriber orders
primary_func_id: RISK-006
related_func_ids: [COPY-001]
module: risk-controls
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_006_002_eod_lockout.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (EOD same-day-expiry lockout), market_hours.in_eod_close_window]
evidence_requirements: [Inside the sub's EOD window, a new 0DTE option mirror is skipped (skipped_eod_same_day_expiry); later-expiry + stocks still mirror]
```
**Preconditions:** Subscriber opted into EOD auto-close; clock set inside the EOD window (ET); `eod_autoclose_enabled=true`.
**Steps:** 1) Trader places a same-day-expiry option; fan out. 2) Also place a later-expiry option + a stock.
**Expected Results:** 0DTE option mirror skipped (`skipped_eod_same_day_expiry`); later-expiry option and stock still mirror.

---
```yaml
id: TC-RISK-006-003
title: EOD sweep flattens subscribers' same-day-expiry option positions before close
primary_func_id: RISK-006
related_func_ids: [JOB-009]
module: risk-controls
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_006_003_eod_sweep.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/eod_autoclose.py (run_loop, _sweep_pairs, same-day-expiry only)]
evidence_requirements: [In-window sweep flattens ONLY 0DTE option positions (marketable LIMIT); later-expiry + stocks untouched; idempotent per day]
```
**Preconditions:** Subscriber opted in; holds a same-day-expiry option + a later-expiry option + a stock; clock in the EOD window; worker running.
**Steps:** 1) Let the EOD sweep tick.
**Expected Results:** Only the 0DTE option is flattened (marketable LIMIT); later-expiry option and stock untouched; sweep runs once per trading day (idempotent). Disabling `eod_autoclose_enabled` disables both sweep and lockout.
```
