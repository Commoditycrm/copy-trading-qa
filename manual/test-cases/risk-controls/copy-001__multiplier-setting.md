# Copy multiplier setting (maps to COPY-001)

The subscriber copy **multiplier** is the copy-scaling control, so its tests map to **COPY-001**
(fanout scaling) — no dedicated RISK id exists for it (see traceability note). These continue the
permanent COPY-001 sequence at **011**. Endpoint `PATCH /api/settings/subscriber/multiplier`.
Source: `backend/app/api/settings.py::set_self_multiplier`, `backend/app/schemas/settings.py`
(`SubscriberSelfMultiplierIn` gt=0,le=10), `backend/app/services/copy_engine.py::_scale_quantity`.

**Environment:** setting cases `[local-qa, qa]`; scaling effect `[local-qa]` fake broker.

---
```yaml
id: TC-COPY-001-011
title: Set copy multiplier with boundary validation and persistence
primary_func_id: COPY-001
related_func_ids: [SUB-001]
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
automation_ref: automation/api/tests/risk/test_tc_copy_001_011_set_multiplier.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, subscriber, P1]
source_refs: [PATCH /api/settings/subscriber/multiplier, backend/app/schemas/settings.py::SubscriberSelfMultiplierIn (gt=0,le=10)]
evidence_requirements: [200 for 0<x≤10; 422 for 0/negative/>10; persisted; audit subscriber.multiplier_changed; cache busted]
```
**Steps:** 1) Set multiplier=2.0; boundaries 0/-1/10.01 → 422; 10 → 200; 0.1 → 200.
**Expected Results:** Only 0<multiplier≤10 accepted; persisted (Numeric(6,3)); audited; subscriber cache invalidated.

---
```yaml
id: TC-COPY-001-012
title: Multiplier governs mirror quantity scaling (cross-check with fanout)
primary_func_id: COPY-001
related_func_ids: []
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
automation_ref: automation/integration/test_tc_copy_001_012_multiplier_scaling.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py::_scale_quantity]
evidence_requirements: [After a multiplier change, the NEXT fanout scales mirror qty by the new value (see TC-COPY-001-002)]
```
**Steps:** 1) Set multiplier=0.5. 2) Trader trades qty 10. 3) Change to 2.0; trader trades qty 10 again.
**Expected Results:** First mirror qty ≈ 5, second ≈ 20 (subject to fractional/whole rounding per broker); the cache-busted change takes effect immediately. Financial-safety: scaling is exact and bounded.
```
