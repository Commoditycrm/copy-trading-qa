# Retry policy setting (maps to COPY-003)

The subscriber **retry interval / max attempts** govern the COPY-003 retry pipeline, so these map to
**COPY-003**, continuing its permanent sequence at **008**. Endpoint
`PATCH /api/settings/subscriber/retry-interval`. Source: `backend/app/api/settings.py::set_retry_interval`
(`_parse` → `RetryInterval` enum), `backend/app/models/settings.py` (`retry_interval_open/close`,
`retry_max_attempts`), `backend/app/services/retry_scheduler.py`.

**Environment:** `[local-qa, qa]` (setting validation). Behavior cross-refs TC-COPY-003-001..007.

---
```yaml
id: TC-COPY-003-008
title: Retry interval enum validation and max-attempts boundary
primary_func_id: COPY-003
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
automation_status: Not Automated
automation_ref: automation/api/tests/risk/test_tc_copy_003_008_retry_policy_validation.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, negative, P1]
source_refs:
  - PATCH /api/settings/subscriber/retry-interval
  - backend/app/api/settings.py::set_retry_interval (_parse → RetryInterval; retry_max_attempts 1–5)
evidence_requirements: [Valid intervals {never,1m,2m,3m,5m} accepted; invalid string → 422; attempts 0/6 → 422; 1 and 5 accepted]
```
**Steps:** 1) Set retry_interval_open=1m, close=5m, attempts=3 → 200. 2) Invalid interval '4m'/'x' → 422. 3) attempts 0 and 6 → 422; 1 and 5 → 200.
**Expected Results:** Only enum values persist; `retry_max_attempts` constrained to 1–5; audit only if changed. (Note: DB enum has orphan values incl. `4m` not in the Python model — baseline §27 VN; if `4m` is unexpectedly accepted, record as Potential.)

---
```yaml
id: TC-COPY-003-009
title: Retry interval NEVER disables retries (behavior cross-check)
primary_func_id: COPY-003
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/risk/test_tc_copy_003_009_retry_never_setting.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, P2]
source_refs: [backend/app/models/settings.py (RetryInterval NEVER default)]
evidence_requirements: [Persisting NEVER stores it; enforcement behavior validated by TC-COPY-003-006]
```
**Steps:** 1) Set retry_interval_open=never.
**Expected Results:** Persisted as NEVER; enforcement (transient error → immediate reject, no RETRY_PENDING) is validated by TC-COPY-003-006.
```
