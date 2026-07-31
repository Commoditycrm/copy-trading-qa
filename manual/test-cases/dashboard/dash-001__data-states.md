# Dashboard — data, loading, error & empty states

**Functionality ID: `DASH-001`** (formal baseline addendum ADD-001 — see `docs/BASELINE_ADDENDA.md`).
Supersedes the provisional `NEW-DASHBOARD` prefix; sequence numbers preserved 1:1 (migration map in the
addendum). The Dashboard screen aggregates existing functionality (me, positions, trades, calendar,
brokers, subscribers/settings). Related approved IDs: AUTH-002, POS-001, HIST-001, PNL-001, BRK-001, SUB-001.

Source: `frontend/app/(app)/dashboard/page.tsx`, `frontend/hooks/useDashboard.ts`,
`frontend/components/dashboard/*`, `frontend/lib/swrCache.ts`, `frontend/lib/api.ts`.

**Environment:** `[local-qa]` (UI E2E via Playwright). Read-only. **Never production.**

---
```yaml
id: TC-DASH-001-001
title: Role-aware dashboard renders KPIs + charts (trader vs subscriber)
primary_func_id: DASH-001
related_func_ids: [POS-001, HIST-001, PNL-001, SUB-001]
module: dashboard
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/ui/tests/dashboard/tc-dash-001-001-role-aware.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [ui, dashboard, P1]
source_refs: [frontend/app/(app)/dashboard/page.tsx, frontend/hooks/useDashboard.ts]
evidence_requirements: [Trader sees "Active subscribers" KPI; subscriber sees "Buying power" KPI; charts render with sufficient data]
```
**Steps:** 1) Log in as trader → dashboard. 2) Log in as subscriber → dashboard.
**Expected Results:** Correct role-specific KPI cards + charts (screenshot evidence); data sourced from the aggregated endpoints.

---
```yaml
id: TC-DASH-001-002
title: Loading state — skeleton shown while data loads
primary_func_id: DASH-001
related_func_ids: []
module: dashboard
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/ui/tests/dashboard/tc-dash-001-002-loading.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [ui, dashboard, P2]
source_refs: [frontend/app/(app)/dashboard/page.tsx (skeleton), components/ui/Skeleton.tsx]
evidence_requirements: [A loading skeleton is visible before data resolves; replaced by content on load]
```
**Steps:** 1) Throttle the network; load the dashboard.
**Expected Results:** Skeleton visible during load; content replaces it (screenshot at both states).

---
```yaml
id: TC-DASH-001-003
title: Error state — an error card with reload appears when the primary fetch fails
primary_func_id: DASH-001
related_func_ids: []
module: dashboard
test_level: L4
test_type: Recovery
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/ui/tests/dashboard/tc-dash-001-003-error.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [ui, dashboard, recovery, P2]
source_refs: [frontend/app/(app)/dashboard/page.tsx (error card + reload)]
evidence_requirements: [When the me/core fetch fails, an error card with a reload action is shown]
```
**Steps:** 1) Force the core fetch to fail. 2) Load the dashboard.
**Expected Results:** Error card + reload displayed; reload retries successfully once the backend recovers.

---
```yaml
id: TC-DASH-001-004
title: Empty state — charts hidden / zeroed KPIs when there is insufficient data
primary_func_id: DASH-001
related_func_ids: []
module: dashboard
test_level: L4
test_type: Boundary
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/ui/tests/dashboard/tc-dash-001-004-empty.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [ui, dashboard, boundary, P2]
source_refs: [frontend/app/(app)/dashboard/page.tsx (charts hidden when insufficient data)]
evidence_requirements: [A brand-new account shows zeroed KPIs and hides charts that need data; no broken/empty chart frames]
```
**Steps:** 1) Log in as a brand-new user (no positions/trades). 2) Load the dashboard.
**Expected Results:** KPIs show zero/placeholder; data-dependent charts hidden gracefully (no empty/broken frames).

---
```yaml
id: TC-DASH-001-005
title: Partial-failure resilience — each aggregated fetch degrades independently
primary_func_id: DASH-001
related_func_ids: [POS-001, HIST-001, PNL-001]
module: dashboard
test_level: L4
test_type: Recovery
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/ui/tests/dashboard/tc-dash-001-005-partial-failure.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [ui, dashboard, recovery, P2]
source_refs: [frontend/hooks/useDashboard.ts (each fetch .catch degrades gracefully; parallel)]
evidence_requirements: [If one of positions/trades/calendar fails, the rest of the dashboard still renders (no full-page error)]
```
**Steps:** 1) Fail only the positions fetch. 2) Load the dashboard.
**Expected Results:** The rest of the dashboard renders; only the affected widget degrades (each `.catch` isolates failure).

---
```yaml
id: TC-DASH-001-006
title: SWR snapshot paints instantly on return navigation
primary_func_id: DASH-001
related_func_ids: []
module: dashboard
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/ui/tests/dashboard/tc-dash-001-006-swr-snapshot.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [ui, dashboard, P2]
source_refs: [frontend/lib/swrCache.ts, frontend/hooks/useDashboard.ts (snapshot key "dashboard")]
evidence_requirements: [Returning to the dashboard paints the cached snapshot immediately, then revalidates]
```
**Steps:** 1) Load dashboard. 2) Navigate away and back.
**Expected Results:** Cached snapshot paints instantly on return; background revalidation updates it. No blank flash.
```
