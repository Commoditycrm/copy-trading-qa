# AUTHZ-001 — Trading ownership & role authorization

Parent: **AUTHZ-001** (continues the permanent sequence from `authz-001__role-ownership.md`, next free
= 009). Trading-specific role/ownership guards on the trades/positions/performance routers.
Source: `backend/app/api/deps.py` (`require_trader`), `backend/app/api/trades.py`,
`backend/app/api/positions.py`, `backend/app/api/performance.py`.

**Environment:** `[local-qa, qa]` with **BROKER_MODE=fake**. Non-mutating permission checks are not destructive.

---
```yaml
id: TC-AUTHZ-001-009
title: Subscriber cannot bulk-cancel/close subscribers (require_trader) — 403
primary_func_id: AUTHZ-001
related_func_ids: [TRADE-003]
module: authz
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_009_subscriber_blocked_bulk_exit.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, security, P1]
source_refs: [POST /api/trades/cancel-all-subscribers-open, POST /api/positions/close-all-subscribers (require_trader)]
evidence_requirements: [403 trader_only for a subscriber token]
```
**Steps:** 1) Subscriber calls cancel-all-subscribers-open and close-all-subscribers.
**Expected Results:** 403 `trader_only` on both; no bulk action performed.

---
```yaml
id: TC-AUTHZ-001-010
title: Subscriber cannot modify a bracket (require_trader) — 403
primary_func_id: AUTHZ-001
related_func_ids: [TRADE-004]
module: authz
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_010_subscriber_blocked_bracket.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, security, P1]
source_refs: [PATCH /api/trades/{order_id}/bracket (require_trader)]
evidence_requirements: [403 trader_only]
```
**Steps:** 1) Subscriber PATCHes a bracket.
**Expected Results:** 403 `trader_only`.

---
```yaml
id: TC-AUTHZ-001-011
title: Closing a position on another user's broker account is refused (404/ownership)
primary_func_id: AUTHZ-001
related_func_ids: [POS-001]
module: authz
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_011_close_cross_user_account.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, security, P0]
source_refs: [POST /api/positions/{broker_symbol}/close?broker_account_id= (ownership guard)]
evidence_requirements: [404 not_found / ownership error using another user's broker_account_id; no close]
```
**Steps:** 1) User B calls position close with user A's broker_account_id.
**Expected Results:** 404 (ownership); no cross-tenant position close.

---
```yaml
id: TC-AUTHZ-001-012
title: Non-trader cannot read own-performance fanouts (require_trader) — 403
primary_func_id: AUTHZ-001
related_func_ids: [PERF-001]
module: authz
test_level: L2
test_type: Permission
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/authz/test_tc_authz_001_012_perf_requires_trader.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, P2]
source_refs: [GET /api/performance/fanouts (require_trader)]
evidence_requirements: [403 trader_only for subscriber/admin]
```
**Steps:** 1) Subscriber (and admin) GET /api/performance/fanouts.
**Expected Results:** 403 `trader_only`.

---
```yaml
id: TC-AUTHZ-001-013
title: Admin has no trader role — cannot place trades (403 trader_only)
primary_func_id: AUTHZ-001
related_func_ids: [TRADE-001]
module: authz
test_level: L2
test_type: Permission
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated (non-trader/subscriber variant of the require_trader guard)
automation_ref: automation/api/tests/trading/trading-authz.spec.ts (TC-AUTHZ-001-013)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, authz, permission, security, P1]
source_refs: [POST /api/trades (require_trader); deps.require_trader (role must be TRADER)]
evidence_requirements: [403 trader_only for an admin token]
```
**Steps:** 1) Admin calls POST /api/trades.
**Expected Results:** 403 `trader_only` — admin role does not grant trading (role separation).
```
