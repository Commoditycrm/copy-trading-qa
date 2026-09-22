# PERF-004 — Full option contract descriptor in the performance trade table

Parent: **PERF-004**, workflow **WF-23** (trader/admin Performance). Source:
`frontend/components/performance/PerformanceView.tsx` (`contractLabel`, `optionExpiryShort`),
`backend/app/api/performance.py` (`list_fanouts` / `_serialize_fanout`) and
`backend/app/api/admin.py` (`admin_list_fanouts`). App fix `4535f4f`.

**Why this matters:** the trade table used to render the bare root (`VG`), which is ambiguous for options.
It now renders the full descriptor — `VG C $14 18 Sep 26` — matching the trader panel and the fanouts
export. The backend already returns `option_expiry` / `option_strike` / `option_right`; the change reads them.

**Environment:** `[local-qa]` with **BROKER_MODE=fake**. Order-producing cases are `@destructive`. **Never production.**

---
```yaml
id: TC-PERF-004-001
title: The fanouts feed exposes the option contract parts for a short-ticker option
primary_func_id: PERF-004
related_func_ids: [ADMIN-002, COPY-001]
module: performance
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/performance/performance-fanouts.spec.ts (TC-PERF-004-001)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, performance, options, requires-fake-broker, requires-seed, P1]
source_refs: [backend/app/api/performance.py::_serialize_fanout]
evidence_requirements: ["GET /api/performance/fanouts row has instrument_type=option, option_right=call, option_strike=14, option_expiry=2026-09-18"]
```
**Preconditions:** trader (fake broker) with ≥1 following subscriber.
**Steps:** 1) Trader places an option order (`VG`, call, strike 14, expiry 2026-09-18). 2) GET
`/api/performance/fanouts`.
**Expected Results:** the fanout row carries `instrument_type=option`, `option_right=call`,
`option_strike=14`, `option_expiry=2026-09-18` — the exact fields `contractLabel()` joins.

---
```yaml
id: TC-PERF-004-002
title: A stock fanout leaves the option contract parts null
primary_func_id: PERF-004
related_func_ids: [ADMIN-002]
module: performance
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/performance/performance-fanouts.spec.ts (TC-PERF-004-002)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, performance, regression, P2]
source_refs: [backend/app/api/performance.py::_serialize_fanout]
evidence_requirements: ["a stock fanout row has instrument_type=stock and null option_expiry/strike/right"]
```
**Preconditions:** trader with ≥1 following subscriber.
**Steps:** 1) Trader places a stock order (`MSFT`). 2) GET `/api/performance/fanouts`.
**Expected Results:** `instrument_type=stock`; `option_expiry`/`option_strike`/`option_right` all null →
`contractLabel()` renders the bare root `MSFT`.

---
```yaml
id: TC-PERF-004-003
title: The performance trade table renders the full option descriptor (UI)
primary_func_id: PERF-004
related_func_ids: [ADMIN-002]
module: performance
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/ui/tests/performance-journeys.spec.ts (TC-PERF-004-003)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, performance, ui, options, P2]
source_refs: [frontend/components/performance/PerformanceView.tsx::contractLabel]
evidence_requirements: ["/performance trade cell shows 'VG C $14 18 Sep 26', not 'VG'"]
```
**Preconditions:** trader who placed the `VG` call option fanout above; logged into the app.
**Steps:** 1) Open `/performance`. 2) Read the Trade column of the option row.
**Expected Results:** the cell shows `VG C $14 18 Sep 26` (root + `C` + `$14` + `18 Sep 26`), not the bare
`VG`.

---
```yaml
id: TC-PERF-004-004
title: A PUT renders "ROOT P $strike expiry"
primary_func_id: PERF-004
related_func_ids: []
module: performance
test_level: L2
test_type: Functional
priority: P3
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Manual
automation_ref: ""
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [functional, performance, options, P3]
source_refs: [frontend/components/performance/PerformanceView.tsx::contractLabel]
evidence_requirements: ["a put option row shows 'P' (not 'C') in the descriptor"]
```
**Preconditions:** a placed PUT option fanout (e.g. `AAPL`, put, strike 250, expiry 2026-12-18).
**Steps:** 1) Open the performance table.
**Expected Results:** the descriptor uses `P` — e.g. `AAPL P $250 18 Dec 26`. `option_right=call → C`,
`put → P`, anything else → the C/P segment is omitted.

---
```yaml
id: TC-PERF-004-005
title: Expiry renders as "DD Mon YY" in UTC (calendar date, no timezone shift)
primary_func_id: PERF-004
related_func_ids: []
module: performance
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Manual
automation_ref: ""
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [functional, performance, options, i18n, P2]
source_refs: [frontend/components/performance/PerformanceView.tsx::optionExpiryShort]
evidence_requirements: ["expiry 2026-09-18 renders '18 Sep 26' regardless of the viewer's local timezone"]
```
**Preconditions:** an option with `option_expiry=2026-09-18`; viewer in a negative-UTC timezone (e.g. US/Pacific).
**Steps:** 1) Open the performance table.
**Expected Results:** expiry shows `18 Sep 26` — the expiry is a calendar date and is formatted in UTC, so
it must NOT slip to `17 Sep 26` for west-of-UTC viewers.

---
```yaml
id: TC-PERF-004-006
title: Admin viewing a trader's performance sees the same descriptor
primary_func_id: PERF-004
related_func_ids: [ADMIN-002]
module: performance
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Manual
automation_ref: ""
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, performance, admin, options, P2]
source_refs: [frontend/app/admin/traders/[trader_id]/page.tsx, backend/app/api/admin.py::admin_list_fanouts]
evidence_requirements: ["/admin/traders/{id} performance table shows 'VG C $14 18 Sep 26' via /api/admin/performance/fanouts"]
```
**Preconditions:** admin; a trader who placed the `VG` option fanout.
**Steps:** 1) As admin, open `/admin/traders/{trader_id}` (or `/admin/performance`). 2) Read the Trade column.
**Expected Results:** the same full descriptor renders — the admin endpoint `admin_list_fanouts` also
serializes the option parts (`admin.py` includes `option_expiry/strike/right`).

---
```yaml
id: TC-PERF-004-007
title: An option row missing a contract part degrades gracefully
primary_func_id: PERF-004
related_func_ids: []
module: performance
test_level: L2
test_type: Negative
priority: P3
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Manual
automation_ref: ""
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [negative, performance, options, robustness, P3]
source_refs: [frontend/components/performance/PerformanceView.tsx::contractLabel]
evidence_requirements: ["with a null strike/expiry, the label joins only present parts — no 'undefined' / '$null' / 'Invalid Date'"]
```
**Preconditions:** an option fanout row with a missing part (e.g. `option_strike` null).
**Steps:** 1) Open the performance table.
**Expected Results:** `contractLabel()` joins only the present segments (`filter(Boolean)`), so the cell shows
e.g. `VG C 18 Sep 26` — never `$null`, `undefined`, or `Invalid Date`.
