# RISK-005 — max_per_contract (UI-only / unenforced confirmation)

Parent **RISK-005**. Endpoint `PATCH /api/settings/subscriber/max-per-contract`. Source:
`backend/app/api/settings.py::set_max_per_contract`, `backend/app/models/settings.py`
(`max_per_contract` Numeric(20,2)), `backend/app/services/copy_engine.py` (does **not** read it — baseline
§17), `frontend/app/(app)/settings/page.tsx`. Baseline §17/§27: the setting is **persisted but never
enforced** server-side (UI-only). These cases confirm each claim; the "unenforced" behavior is a
**Known/Potential** finding until reproduced twice.

**Environment:** setting cases `[local-qa, qa]`; enforcement case `[local-qa]` **BROKER_MODE=fake** (`@destructive`). **Never production.**

---
```yaml
id: TC-RISK-005-001
title: max_per_contract setting is accepted (bounds ge=0) with validation
primary_func_id: RISK-005
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
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-005-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, P1]
source_refs: [PATCH /api/settings/subscriber/max-per-contract (Decimal ge=0), backend/app/api/settings.py::set_max_per_contract]
evidence_requirements: [Valid value (e.g. 500) → 200 SubscriberSettingsOut; negative → 422; null clears; audit subscriber.max_per_contract_changed]
```
**Steps (data-driven):** set 500 → 200; -1 → 422; 0 → 200; null → clears.
**Expected Results:** Accepted for ≥0; negative rejected; audited.

---
```yaml
id: TC-RISK-005-002
title: max_per_contract persists to the database
primary_func_id: RISK-005
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Data-Integrity
priority: P1
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/risk/test_tc_risk_005_002_persist.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, data-integrity, P1]
source_refs: [backend/app/models/settings.py (max_per_contract Numeric(20,2)), GET /api/settings/subscriber]
evidence_requirements: [After PATCH, GET returns the stored value; DB column reflects it across sessions]
```
**Steps:** 1) PATCH max-per-contract=500. 2) GET settings (new request).
**Expected Results:** Value persisted and returned by GET (survives across requests).

---
```yaml
id: TC-RISK-005-003
title: Copy engine does NOT enforce max_per_contract — mirror exceeding the cap is still placed (Known/Potential)
primary_func_id: RISK-005
related_func_ids: [COPY-001]
module: risk-controls
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
defect_status: Potential
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_005_003_not_enforced.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (never reads max_per_contract — baseline §17/§27), backend/app/services/pnl_poller.py]
evidence_requirements: [With max_per_contract set low, a fanned-out mirror whose per-contract cost exceeds the cap is STILL placed (no clamp/skip) — confirms unenforced]
```
**Preconditions:** Subscriber with `max_per_contract` set low; trader trades a contract whose per-contract cost exceeds it.
**Steps:** 1) Set max-per-contract low. 2) Trader fans out an order above the cap. 3) Inspect the mirror.
**Expected Results (documented):** the mirror is **placed anyway** — the copy engine/poller never reads `max_per_contract`. `defect_status: Potential` — this **confirms the documented unenforced behavior**; do NOT mark Confirmed until reproduced **twice** in QA and env/test-data ruled out (DEFECT_MANAGEMENT_PROCESS §7). If enforcement *is* observed, the baseline is wrong → update VERIFICATION_NOTES.

---
```yaml
id: TC-RISK-005-004
title: The Settings UI displays and edits max_per_contract
primary_func_id: RISK-005
related_func_ids: []
module: risk-controls
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/ui/tests/settings/tc-risk-005-004-ui-display.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [ui, risk-controls, P2]
source_refs: [frontend/app/(app)/settings/page.tsx (max-per-contract field in Risk Controls)]
evidence_requirements: [The Settings Risk-Controls section shows the max_per_contract field; editing it PATCHes and reflects the saved value]
```
**Steps:** 1) Open Settings as a subscriber. 2) Set/observe the max-per-contract field.
**Expected Results:** Field visible and editable; saved value displayed on reload. (Screenshot evidence.)

---
```yaml
id: TC-RISK-005-005
title: max_per_contract change does NOT bust the subscriber cache (documented divergence)
primary_func_id: RISK-005
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Data-Integrity
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-005-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, data-integrity, P2]
source_refs: [backend/app/api/settings.py::set_max_per_contract (does NOT call invalidate_subscribers_for_trader — baseline §item)]
evidence_requirements: [Unlike other risk settings, changing max_per_contract does not invalidate the subscriber cache (consistent with it being unenforced in fanout)]
```
**Steps:** 1) Follow a trader (populate cache). 2) PATCH max-per-contract. 3) Inspect cache-bust behavior.
**Expected Results:** No cache invalidation on change (documented — it is not read on the fanout path). Consistent with the unenforced behavior; record as an observation.
