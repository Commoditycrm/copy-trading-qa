# RISK-004 — Symbol include / exclude filters

Parent: **RISK-004**. Endpoint `PATCH /api/settings/subscriber/symbol-filter`. Source:
`backend/app/api/settings.py::set_symbol_filter` (`_normalize_symbols`), `backend/app/models/settings.py`
(`symbol_exclusion_list`/`symbol_inclusion_list` JSONB), `backend/app/services/copy_engine.py`
(exclusion checked then inclusion, both uppercased).

**Environment:** setting cases `[local-qa, qa]`; fanout-effect cases `[local-qa]` fake broker `@destructive`.

---
```yaml
id: TC-RISK-004-001
title: Exclusion list — excluded symbol is not mirrored, others are
primary_func_id: RISK-004
related_func_ids: [COPY-001]
module: risk-controls
test_level: L3
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_004_001_exclude.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P1]
source_refs: [PATCH /api/settings/subscriber/symbol-filter, backend/app/services/copy_engine.py (exclusion)]
evidence_requirements: [Trader trade in an excluded symbol → no mirror; non-excluded symbol → mirror]
```
**Steps:** 1) Exclude TSLA. 2) Trader trades TSLA then AAPL.
**Expected Results:** TSLA not mirrored; AAPL mirrored; audit `subscriber.symbol_filter` only if changed.

---
```yaml
id: TC-RISK-004-002
title: Inclusion list — only listed symbols are mirrored
primary_func_id: RISK-004
related_func_ids: [COPY-001]
module: risk-controls
test_level: L3
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_004_002_include.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (inclusion enforced)]
evidence_requirements: [With inclusion=[AAPL], only AAPL mirrors; MSFT does not]
```
**Steps:** 1) Inclusion=[AAPL]. 2) Trader trades AAPL then MSFT.
**Expected Results:** AAPL mirrored; MSFT not mirrored.

---
```yaml
id: TC-RISK-004-003
title: Include/exclude conflict — a symbol in both lists is excluded (exclusion evaluated first)
primary_func_id: RISK-004
related_func_ids: [COPY-001]
module: risk-controls
test_level: L3
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_004_003_conflict.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (exclusion list checked BEFORE inclusion)]
evidence_requirements: [A symbol present in BOTH lists is NOT mirrored (exclusion wins)]
```
**Steps:** 1) exclude=[NVDA], include=[NVDA]. 2) Trader trades NVDA.
**Expected Results:** NVDA not mirrored — exclusion takes precedence (documents the evaluation order). If observed order differs, record as a Potential (reproduce twice) rather than assuming.

---
```yaml
id: TC-RISK-004-004
title: Symbol list normalization — uppercased, trimmed, de-duplicated, capped at 200
primary_func_id: RISK-004
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Boundary
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/risk/test_tc_risk_004_004_normalization.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, P2]
source_refs: [backend/app/api/settings.py::set_symbol_filter::_normalize_symbols (uppercase/strip/dedup, max_length=200)]
evidence_requirements: [' aapl ', 'AAPL', 'Aapl' collapse to one 'AAPL'; >200 entries rejected/capped]
```
**Steps:** 1) Submit mixed-case/whitespace/duplicate symbols; submit >200 entries.
**Expected Results:** Stored uppercased, trimmed, de-duplicated; list capped at 200 (per-list `max_length`).
```
