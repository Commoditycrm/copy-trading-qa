# ADMIN-001..007 — Admin operations

Parents **ADMIN-001** (users), **ADMIN-002** (dashboards), **ADMIN-003** (rejected), **ADMIN-004** (load-test),
**ADMIN-005** (config; sms/test = 001), **ADMIN-007** (orphaned dashboard). Endpoints `/api/admin/*`
(all `require_admin`). Source: `backend/app/api/admin.py`, `backend/app/services/platform_config.py`,
`backend/app/services/excel_export.py`, `frontend/app/admin/**`.

**Environment:** `[local-qa, qa]` (admin API). `@destructive` for load-test seed/cleanup (fake data). **Never production.**

---
```yaml
id: TC-ADMIN-001-001
title: User management — list (filters/sort/pagination), activate/deactivate, role change, business-name
primary_func_id: ADMIN-001
related_func_ids: []
module: admin
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, admin, P1]
source_refs: [GET /api/admin/users (role/status/search/sort/dir/limit/offset), PATCH users/{id}/{activate,deactivate,role,business-name}, backend/app/api/admin.py]
evidence_requirements: [Paginated list excludes fake-load-test-*; activate/deactivate toggles is_active; role change persists; business-name trader-only]
```
**Steps (data-driven):** list with filters/sort; activate/deactivate a user; change a role; rename a trader business-name.
**Expected Results:** Correct paging/filtering; state changes persist; load-test users excluded from listings.

---
```yaml
id: TC-ADMIN-001-002
title: Admin safety guards — cannot deactivate an admin, cannot change own role, business-name trader-only
primary_func_id: ADMIN-001
related_func_ids: []
module: admin
test_level: L2
test_type: Negative
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, admin, negative, P1]
source_refs: [backend/app/api/admin.py (400 cannot_deactivate_admin; 400 cannot_change_own_role; 400 if business-name on non-trader; 422 business_name_blank; 404 user_not_found)]
evidence_requirements: [Deactivate an admin → 400; change own role → 400; business-name on non-trader → 400; blank → 422; unknown id → 404]
```
**Steps (data-driven):** each guard.
**Expected Results:** As annotated.

---
```yaml
id: TC-ADMIN-001-003
title: Admin user mutations are NOT written to the audit log (observation)
primary_func_id: ADMIN-001
related_func_ids: []
module: admin
test_level: L2
test_type: Data-Integrity
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, admin, data-integrity, P2]
source_refs: [backend/app/api/admin.py (activate/deactivate/role/business-name → only log.info, no audit row — baseline §22)]
evidence_requirements: [After activate/deactivate/role/business-name, NO audit_logs row is created (only application log)]
```
**Steps:** 1) Perform each admin user mutation. 2) Query audit_logs.
**Expected Results:** No audit rows for these admin actions (documented gap). If the product requires admin auditability, this is a governance gap (not a code defect) — record.

---
```yaml
id: TC-ADMIN-002-002
title: Admin dashboards — stats, user-counts (cached), daily-pnl split
primary_func_id: ADMIN-002
related_func_ids: [PNL-001]
module: admin
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, admin, P2]
source_refs: [GET /api/admin/{stats,users/counts,daily-pnl}, backend/app/api/admin.py (stats cached 20s; daily-pnl live fill-in ≤3 days, mixed basis)]
evidence_requirements: [stats {users/traders/subscribers/admins/active/trades_today(UTC)/fake_test_subs}; user-counts cached; daily-pnl merges frozen snapshots + ≤3-day live fill-in]
```
**Steps:** 1) GET stats, counts, daily-pnl (filters).
**Expected Results:** Correct aggregates; `trades_today` uses UTC midnight (note vs ET elsewhere); daily-pnl mixed basis (Webull realized / Alpaca marked / live realized).

---
```yaml
id: TC-ADMIN-003-001
title: Rejected-order triage — filters, limit clamp (1–500), truncation flag
primary_func_id: ADMIN-003
related_func_ids: []
module: admin
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, admin, P2]
source_refs: [GET /api/admin/rejected-orders (role, from/to, limit clamped 1–500), backend/app/api/admin.py::admin_rejected_orders]
evidence_requirements: [Returns REJECTED+RETRY_PENDING with payload fields; limit clamped 1–500; truncated flag when exceeded; invalid role → 422]
```
**Steps:** 1) List rejected with role/date filters + a huge limit.
**Expected Results:** Clamped to 500; `truncated` set; reconstructed payload + broker response + "never sent" detection fields present.

---
```yaml
id: TC-ADMIN-004-001
title: Load-test — seed fake subscribers (idempotent), count, and permanent cleanup (CASCADE)
primary_func_id: ADMIN-004
related_func_ids: [BRK-001]
module: admin
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, admin, destructive, requires-fake-broker, requires-seed, P2]
source_refs: [POST /api/admin/load-test/{seed,cleanup}, GET count, backend/app/api/admin.py (fake-load-test-* pattern; CASCADE delete)]
evidence_requirements: [Seed creates N fake subscribers (broker=fake, idempotent, shared bcrypt pw); count reflects them; cleanup CASCADE-deletes exactly them]
```
**Steps:** 1) Seed N (1–500). 2) Count. 3) Cleanup.
**Expected Results:** Idempotent seed (skips existing); count matches; cleanup permanently deletes all `fake-load-test-*` (CASCADE accounts/settings/orders) — admin dev tool (permanent delete allowed here).

---
```yaml
id: TC-ADMIN-005-002
title: Runtime config knobs — fanout-batch-threshold and alpaca-poll-interval (bounds + Redis override)
primary_func_id: ADMIN-005
related_func_ids: [JOB-007, COPY-001]
module: admin
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, admin, boundary, redis, P1]
source_refs: [GET/PATCH /api/admin/config/{fanout-batch-threshold (1–10000), alpaca-pnl-poll-interval (1–300)}, backend/app/services/platform_config.py]
evidence_requirements: [PATCH sets a Redis override; GET returns {default, override, effective}; out-of-range → 422; null resets to env default]
```
**Steps:** 1) GET/PATCH each knob (valid, boundary, null reset).
**Expected Results:** Override persisted in Redis; effective value reflects it; bounds enforced; null clears override.

---
```yaml
id: TC-ADMIN-001-004
title: Admin authorization — every /api/admin/* endpoint requires admin (403 otherwise)
primary_func_id: ADMIN-001
related_func_ids: [AUTHZ-001]
module: admin
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, admin, permission, security, P0]
source_refs: [backend/app/api/deps.py::require_admin, all backend/app/api/admin.py routes]
evidence_requirements: [Trader and subscriber tokens → 403 admin_only on a representative set of admin endpoints; unauthenticated → 401]
```
**Steps:** 1) Trader + subscriber call admin stats/users/reconcile/config/load-test.
**Expected Results:** 403 `admin_only` for non-admins across the surface; 401 unauthenticated. Admin-privilege enforcement (P0).

---
```yaml
id: TC-ADMIN-007-001
title: Orphaned admin dashboard is reachable only by direct URL (unreachable via nav)
primary_func_id: ADMIN-007
related_func_ids: []
module: admin
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated (API-level — backend returns 404; UI-nav unreachability facet remains manual)
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-08-04
tags: [ui, admin, P2]
source_refs: [frontend/app/admin/dashboard/* (no nav entry/links — baseline §26 Unreachable)]
evidence_requirements: [/admin/dashboard loads only via direct URL; no nav item or in-app link points to it]
```
**Steps:** 1) Inspect admin nav (no link). 2) Navigate directly to /admin/dashboard.
**Expected Results:** Page renders via URL but is unreachable through the UI (documented dead/unreachable route). Recommend removal or wiring — governance note.

---
```yaml
id: TC-ADMIN-001-005
title: DEF-ADMIN-001 — shipped user_role enum label case drift breaks every admin endpoint (500)
primary_func_id: ADMIN-001
related_func_ids: []
module: admin
test_level: L2
test_type: Data-Integrity
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated (DEFECT CONFIRM — documents current behavior)
automation_ref: automation/api/tests/admin/admin.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-08-04
tags: [api, admin, defect, data-integrity, P0]
source_refs: [alembic f1a2b3c4d5e6_add_admin_role (ADD VALUE 'admin' lowercase), app/models/user.py::UserRole (persists/reads by NAME 'ADMIN'), no fix migration (cf. f9c2e3d8a1b7_fix_enum_case_drift for other enums)]
evidence_requirements: [A user promoted to the shipped lowercase 'admin' label makes the admin's own row un-deserializable → GET /api/admin/stats returns 500 (LookupError: 'admin' not among enum values)]
```
**Steps:** 1) Promote a synthetic user to the shipped lowercase `admin` label. 2) GET /api/admin/stats with a valid admin token.
**Expected Results (defect):** 500 Internal Server Error — the ORM cannot map the lowercase label to `UserRole`. **Correct behavior would be 200.** QA remediation (add the correct `ADMIN` label) unblocks the rest of the admin suite; the app must ship `ALTER TYPE user_role RENAME VALUE 'admin' TO 'ADMIN'`. See DEF-ADMIN-001.
