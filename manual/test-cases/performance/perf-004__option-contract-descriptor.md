# PERF-004 — Full option contract descriptor in the performance trade table

Parent: **PERF-004**, workflow **WF-23** (trader/admin Performance). App fix `4535f4f` / **PR #297**.
Source: `frontend/components/performance/PerformanceView.tsx` (`contractLabel`, `optionExpiryShort`),
`backend/app/api/performance.py` (`list_fanouts` / `_serialize_fanout`),
`backend/app/api/admin.py` (`admin_list_fanouts`).

**Why:** the trade table used to render the bare root (`VG`), ambiguous for options. It now renders the
full descriptor — `VG C $14 18 Sep 26` (root + C/P + $strike + `DD Mon YY` UTC expiry) — matching the
trader panel and the fanouts export. The backend already returns `option_expiry/strike/right`.

**Environment:** `[local-qa]`, BROKER_MODE=fake. Order-producing cases are `@destructive`. **Never production.**

Maps PDF section **E**: E1→004-003, E2→004-004, E3→004-002, E4→004-008, E5→004-007.

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
tags: [integration, performance, options, P1]
source_refs: [backend/app/api/performance.py::_serialize_fanout]
evidence_requirements: ["GET /api/performance/fanouts row: instrument_type=option, option_right=call, option_strike=14, option_expiry=2026-09-18"]
```
**Data contract** the label depends on — an option fanout row carries `instrument_type=option` and
`option_expiry/strike/right`.

---
```yaml
id: TC-PERF-004-002
title: E3 — a stock fanout leaves the option contract parts null (bare root label)
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
evidence_requirements: ["a stock fanout row has instrument_type=stock and null option fields → contractLabel renders 'META'"]
```
**E3** trader with a stock trade → plain ticker (e.g. `META`), no strike/expiry.

---
```yaml
id: TC-PERF-004-003
title: E1 — the performance trade table renders the full option descriptor (UI)
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
evidence_requirements: ["/performance trade cell shows 'VG C $14 18 Sep 26', not bare 'VG'"]
```
**E1** open a trader with an option trade → Trade column shows `VG C $14 18 Sep 26`, not bare `VG`.

---
```yaml
id: TC-PERF-004-004
title: E2 — a put option exposes option_right=put (renders "P")
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
automation_ref: automation/api/tests/performance/performance-fanouts.spec.ts (TC-PERF-004-004)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, performance, options, P2]
source_refs: [frontend/components/performance/PerformanceView.tsx::contractLabel]
evidence_requirements: ["a put fanout row has option_right=put → contractLabel renders 'P' (e.g. AG P $17 14 Aug 26)"]
```
**E2** an option that is a put → shows `P` (e.g. `AG P $17 14 Aug 26`). `call → C`, `put → P`, else the
C/P segment is omitted.

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
evidence_requirements: ["expiry 2026-09-18 renders '18 Sep 26' regardless of the viewer's timezone (no slip to 17 Sep)"]
```
**Manual** — viewer west of UTC (e.g. US/Pacific): expiry `2026-09-18` must show `18 Sep 26`, not slip to
`17 Sep 26` (the expiry is a calendar date, formatted in UTC).

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
production_safe: true
destructive: false
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
**Manual** — Traders → [trader] → Performance shows the same full descriptor (`admin_list_fanouts` also
serializes the option parts).

---
```yaml
id: TC-PERF-004-007
title: E5 — an option row missing a contract part degrades gracefully
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
evidence_requirements: ["with a null strike/expiry the label joins only present parts — no '$null' / 'undefined' / 'Invalid Date'"]
```
**E5 / Manual** — option with null expiry/strike renders gracefully (shows what's available), never
`$null`, `undefined`, or `Invalid Date` (`contractLabel` uses `filter(Boolean)`).

---
```yaml
id: TC-PERF-004-008
title: E4 — on-screen label matches the fanouts export descriptor
primary_func_id: PERF-004
related_func_ids: [EXPORT-001]
module: performance
test_level: L3
test_type: Integration
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
tags: [integration, performance, export, options, P3]
source_refs: [backend/app/api/admin.py::admin_export_fanouts]
evidence_requirements: ["the on-screen descriptor equals the 'Export fanouts' file's contract descriptor for the same row"]
```
**E4 / Manual** — compare the on-screen label to the "Export fanouts" file → the same descriptor appears
in both (screen vs export parity).
