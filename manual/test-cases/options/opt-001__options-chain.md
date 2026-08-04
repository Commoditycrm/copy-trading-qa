# OPT-001 — Options expiries, strikes & quote

Parent **OPT-001** (continues at 002; TC-OPT-001-001 in brokers covered availability/501). Endpoints
`/api/options/{expiries,strikes,quote}`. Source: `backend/app/api/options.py`, `backend/app/brokers/alpaca.py`
(list_option_contracts, get_option_latest_quote, DataFeed.IEX). Alpaca-only (501 otherwise), owner-only account.

**Environment:** `[local-qa]` **BROKER_MODE=fake** (or Alpaca-shaped mock). Read-only (non-destructive). **Never production.**

---
```yaml
id: TC-OPT-001-002
title: Expiries endpoint returns future expiries for an Alpaca account
primary_func_id: OPT-001
related_func_ids: [BRK-001]
module: options
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/options/test_tc_opt_001_002_expiries.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, options, requires-fake-broker, P2]
source_refs: [GET /api/options/expiries?account_id&symbol, backend/app/api/options.py (window today→+180d, limit 10000)]
evidence_requirements: [200 {symbol, expiries[]} within a ~180-day window; broker error → 502]
```
**Steps:** 1) GET expiries for a valid symbol + Alpaca account.
**Expected Results:** 200 with future expiries (≤180d window); broker failure → 502.

---
```yaml
id: TC-OPT-001-003
title: Strikes endpoint returns strikes for an expiry with underlying price
primary_func_id: OPT-001
related_func_ids: []
module: options
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/options/test_tc_opt_001_003_strikes.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, options, requires-fake-broker, P2]
source_refs: [GET /api/options/strikes?account_id&symbol&expiry&right, backend/app/api/options.py]
evidence_requirements: [200 {symbol, expiry, right, strikes[], underlying_price}; right defaults call; underlying null on failure (best-effort)]
```
**Steps:** 1) GET strikes for a valid expiry, right=call then put.
**Expected Results:** 200 with strikes + underlying price (null if unavailable); right validated `^(call|put)$`.

---
```yaml
id: TC-OPT-001-004
title: Quote endpoint returns bid/ask/mid; illiquid returns nulls; debug=1 discloses a stack trace
primary_func_id: OPT-001
related_func_ids: [SEC-001]
module: options
test_level: L2
test_type: Security
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/options.spec.ts (TC-OPT-001-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, options, security, requires-fake-broker, P1]
source_refs: [GET /api/options/quote (debug param), backend/app/api/options.py (broad except → null bid/ask; _debug error_traceback last 1500 chars — baseline §15.4)]
evidence_requirements: [Valid contract → {bid,ask,mid}; illiquid/after-hours → nulls (not error); ?debug=1 returns _debug with error_traceback (owner-only info disclosure)]
```
**Steps:** 1) Quote a liquid contract. 2) Quote an illiquid one. 3) Quote with `?debug=1`.
**Expected Results:** Liquid → bid/ask/mid; illiquid → nulls; `debug=1` exposes internal stack trace/broker state to the authenticated owner — **info-disclosure observation** (baseline §15.4). If product treats debug as prod-facing, raise Potential (reproduce twice).

---
```yaml
id: TC-OPT-001-005
title: Options endpoints validation and Alpaca-only enforcement
primary_func_id: OPT-001
related_func_ids: [BRK-001]
module: options
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/options.spec.ts (TC-OPT-001-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, options, negative, P1]
source_refs: [backend/app/api/options.py (404 broker_account_not_found; 501 non-Alpaca; symbol/strike/right validation)]
evidence_requirements: [Missing/foreign account_id → 404; non-Alpaca account → 501; invalid symbol/strike/right → 422]
```
**Steps (data-driven):** foreign account_id → 404; non-Alpaca → 501; missing symbol / bad right → 422.
**Expected Results:** As annotated; endpoints require an owned Alpaca account.

---
```yaml
id: TC-OPT-001-006
title: Options endpoints authorization — any authenticated user, owner-only account
primary_func_id: OPT-001
related_func_ids: [AUTHZ-001]
module: options
test_level: L2
test_type: Permission
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/portfolio/options.spec.ts (TC-OPT-001-006)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, options, permission, P1]
source_refs: [backend/app/api/options.py (current_user; account ownership → 404)]
evidence_requirements: [Any role may call with an owned account; another user's account_id → 404; unauthenticated → 401]
```
**Steps:** 1) Trader/subscriber/admin call with own account. 2) Call with another user's account_id.
**Expected Results:** Allowed for any authenticated role with an owned account; foreign account → 404; no token → 401.
