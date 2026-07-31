# RISK-003 — Position TP/SL & copy-trader-bracket mutual exclusion

Parent: **RISK-003**, workflow **WF-15**. Endpoints `PATCH /api/settings/subscriber/{position-tp-pct,
position-sl-pct, copy-trader-bracket}`. Source: `backend/app/api/settings.py`,
`backend/app/services/position_enforcer.py` (early-return when copy_trader_bracket on),
`backend/app/services/bracket_emulator.py` (reconcile_copy_brackets), `pnl_poller.py`.

**Environment:** setting cases `[local-qa, qa]`; enforcement `[local-qa]` fake broker `@destructive`.

---
```yaml
id: TC-RISK-003-001
title: Set position take-profit percentage with boundary validation
primary_func_id: RISK-003
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-003-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, P1]
source_refs: [PATCH /api/settings/subscriber/position-tp-pct (gt=0,le=1000)]
evidence_requirements: [200 for 0<pct≤1000; 422 for 0/negative/>1000; null clears; audit]
```
**Steps:** 1) Set TP%=50; boundaries 0/-1/1000.01 → 422; 1000 → 200; null clears.
**Expected Results:** Only 0<pct≤1000 accepted; persisted + audited.

---
```yaml
id: TC-RISK-003-002
title: Set position stop-loss percentage with boundary validation
primary_func_id: RISK-003
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
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-003-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, P1]
source_refs: [PATCH /api/settings/subscriber/position-sl-pct (gt=0,le=100)]
evidence_requirements: [200 for 0<pct≤100; 422 otherwise; null clears; audit]
```
**Steps:** 1) Set SL%=20; boundaries 0/-1/100.01 → 422; 100 → 200; null clears.
**Expected Results:** Only 0<pct≤100 accepted; persisted + audited.

---
```yaml
id: TC-RISK-003-003
title: Toggle copy-trader-bracket setting
primary_func_id: RISK-003
related_func_ids: [COPY-004]
module: risk-controls
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-003-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, P1]
source_refs: [PATCH /api/settings/subscriber/copy-trader-bracket]
evidence_requirements: [Boolean persisted; audit subscriber.copy_trader_bracket_changed]
```
**Steps:** 1) PATCH copy-trader-bracket=true then false.
**Expected Results:** Persisted + audited each way.

---
```yaml
id: TC-RISK-003-004
title: Mutual exclusion — with copy-trader-bracket ON, the position enforcer does NOT also close (no double-exit)
primary_func_id: RISK-003
related_func_ids: [COPY-004]
module: risk-controls
test_level: L3
test_type: Data-Integrity
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-behavior.spec.ts (TC-RISK-003-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, data-integrity, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/position_enforcer.py::enforce_position_tp_sl (early-return if copy_trader_bracket)]
evidence_requirements: [With copy_trader_bracket=true, position_enforcer is a no-op; only the copied bracket exits — never both]
```
**Preconditions:** Subscriber with BOTH position TP/SL set AND copy_trader_bracket=true; an open copied position.
**Steps:** 1) Drive P&L to hit both mechanisms' thresholds.
**Expected Results:** The position enforcer early-returns (copy-bracket path wins); the position is closed **once**, not twice. Financial-safety invariant (no double-close).

---
```yaml
id: TC-RISK-003-005
title: Position TP/SL enforcement closes the position when unrealized pct crosses the threshold
primary_func_id: RISK-003
related_func_ids: []
module: risk-controls
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-behavior.spec.ts (TC-RISK-003-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/position_enforcer.py::enforce_position_tp_sl, pnl_poller.py]
evidence_requirements: [unrealized ≥ TP% → TP close leg; ≤ -SL% → SL close leg; stocks MARKET, options LIMIT; 30s SL cooldown]
```
**Preconditions:** copy_trader_bracket=false; position TP%/SL% set; an open position (fake broker).
**Steps:** 1) Move unrealized P&L past TP (then a separate case past SL).
**Expected Results:** Enforcer closes the position (TP or SL leg); stocks close MARKET, options LIMIT; SL-only 30s post-fill cooldown respected; in-flight guard prevents duplicate close.
```
