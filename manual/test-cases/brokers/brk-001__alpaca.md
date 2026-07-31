# Alpaca broker integration (Stage 2)

Primary **BRK-001** (Alpaca connect — continues sequence at 021), with **OPT-001** (options chain),
**JOB-002** (Alpaca listener), **TRADE-001** (order-error normalization / fractional), **TRADE-004**
(native bracket). Source: `backend/app/brokers/alpaca.py` (TradingClient, verify_connection, place_order,
brackets, get_positions, get_pnl_snapshot, options data, DataFeed.IEX), `backend/app/api/brokers.py`,
`backend/app/api/options.py`, `backend/app/services/trade_listener.py`, `automation/common/safety.ts`.

**Environment:** `[local-qa]` **BROKER_MODE=fake** for order/connection flows; the real Alpaca **Paper**
path is `@paper @broker-contract` **manual-only** (`PAPER_SUITE_AUTHORIZED=true`). **Never real-money. Never production.**

---
```yaml
id: TC-BRK-001-021
title: Valid Alpaca Paper account connection (manual paper suite) verifies and connects
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_021_alpaca_paper_connect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, paper, broker-contract, destructive, P1]
source_refs: [POST /api/brokers (broker=alpaca, paper=true), backend/app/brokers/alpaca.py::verify_connection]
evidence_requirements: [201 connected; is_paper=true; account number + supports_fractional populated; encrypted creds]
```
**Preconditions:** Alpaca **Paper** creds from the DevOps-owned secret store; `PAPER_SUITE_AUTHORIZED=true` (manual run only).
**Steps:** 1) POST connect with paper=true.
**Expected Results:** 201; verified against Alpaca paper; `is_paper=true`; fractional support flag set. (Default automated CI uses fake broker; this case runs only in the manual paper suite.)

---
```yaml
id: TC-BRK-001-022
title: Live-account configuration safety — a paper=false connection must never be used for automated order placement
primary_func_id: BRK-001
related_func_ids: [AUTHZ-001]
module: brokers
test_level: L2
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_022_live_account_safety.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, security, P0]
source_refs: [backend/app/schemas/broker.py::AlpacaCredentialsIn (paper default true), automation/common/safety.ts]
evidence_requirements: [Automation refuses to place/cancel orders on a paper=false (live) account; guard blocks destructive tests unless broker=fake]
```
**Steps:** 1) Assert the harness never targets a live (paper=false) Alpaca account for order placement.
**Expected Results:** `assertDestructiveAllowed` requires `broker=fake`; a live account can never be driven by destructive suites. Real-money safety (P0).

---
```yaml
id: TC-BRK-001-023
title: Invalid API key / invalid secret → verification fails, connection rolled back
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L3
test_type: Negative
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_023_alpaca_invalid_creds.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/brokers/alpaca.py::verify_connection, backend/app/api/brokers.py::connect]
evidence_requirements: [Invalid key/secret → 400 broker_error; audit broker.connect_failed; no account persisted]
```
**Steps (data-driven, fake broker simulating Alpaca auth failure):** invalid key; invalid secret.
**Expected Results:** 400 `broker_error`; `audit broker.connect_failed`; rollback (no connected account).

---
```yaml
id: TC-BRK-001-024
title: Paper/live mode mismatch is rejected at verification
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L3
test_type: Negative
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_024_paper_live_mismatch.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/brokers/alpaca.py (client built with paper flag; wrong endpoint → auth failure)]
evidence_requirements: [Live creds with paper=true (or vice versa) → verification failure, no connection]
```
**Steps:** 1) Submit live creds with paper=true (and the inverse).
**Expected Results:** Verification fails (wrong base URL/entitlement); 400; rollback.

---
```yaml
id: TC-BRK-001-025
title: Successful verification and balance retrieval
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L3
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_025_alpaca_verify_balance.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, destructive, requires-fake-broker, P1]
source_refs: [backend/app/brokers/alpaca.py::get_balance_snapshot, _refresh_balance_into]
evidence_requirements: [After connect, balances populated (cash/buying_power/total_equity); get_pnl_snapshot returns None safely on error]
```
**Steps:** 1) Connect (fake/paper). 2) Refresh balance.
**Expected Results:** Balances populated; a broker read error surfaces as `last_error` (never a crash).

---
```yaml
id: TC-OPT-001-001
title: Options chain availability — Alpaca returns expiries/strikes/quote; non-Alpaca returns 501
primary_func_id: OPT-001
related_func_ids: [BRK-001]
module: brokers
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_opt_001_001_options_chain.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, options, requires-fake-broker, P2]
source_refs: [GET /api/options/{expiries,strikes,quote}, backend/app/api/options.py, backend/app/brokers/alpaca.py (IEX feed)]
evidence_requirements: [Alpaca account → 200 chain data; non-Alpaca account → 501; owner-only (404 for another user's account_id)]
```
**Steps:** 1) GET options/expiries|strikes|quote with an Alpaca account. 2) Same with a non-Alpaca account.
**Expected Results:** Alpaca → 200 chain; non-Alpaca → 501; quote broad-except returns null bid/ask on illiquid/after-hours (not an error). `?debug=1` exposes a stack trace (owner-only) — flag as info-disclosure per baseline §15.4.

---
```yaml
id: TC-JOB-002-001
title: Alpaca trader connect requests a listener start (worker, WebSocket)
primary_func_id: JOB-002
related_func_ids: [BRK-001]
module: brokers
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_002_001_alpaca_listener_start.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, listener, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/trade_listener.py (Alpaca TradingStream), listener_control, backend/app/api/brokers.py]
evidence_requirements: [Trader Alpaca connect → listener:control start requested; worker starts the Alpaca WS listener; listener_state shows connected]
```
**Steps:** 1) Trader connects Alpaca (fake). 2) Inspect listener state / worker logs.
**Expected Results:** Listener start requested via Redis `listener:control`; worker starts the Alpaca listener; status becomes connected. (Cross-ref JOB-005/006 in listener-lifecycle.)

---
```yaml
id: TC-JOB-002-002
title: Listener health/status endpoint reflects the Alpaca listener state
primary_func_id: JOB-002
related_func_ids: [ADMIN-002]
module: brokers
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_job_002_002_listener_status.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, listener, P2]
source_refs: [GET /api/listener/status, GET /api/admin/listener-health, backend/app/services/listener_state.py]
evidence_requirements: [Status pill reflects connected/disconnected/last_event_at; admin listener-health lists the trader listener]
```
**Steps:** 1) GET /api/listener/status (trader). 2) Admin GET /api/admin/listener-health.
**Expected Results:** State reflects the live Alpaca listener; admin health panel lists it. (admin listener-health maps to ADMIN-002 dashboards — see traceability gap note.)

---
```yaml
id: TC-TRADE-001-011
title: Alpaca broker order error normalization (classify_error)
primary_func_id: TRADE-001
related_func_ids: [COPY-003]
module: brokers
test_level: L2
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_trade_001_011_alpaca_error_normalization.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/order_retry.py::classify_error, backend/app/brokers/alpaca.py error shapes]
evidence_requirements: [Alpaca error shapes map to user-fixable (clean reject) vs transient (retry) vs raw consistently]
```
**Steps (data-driven):** simulate Alpaca 40310000 (non-fractionable), wash-trade, insufficient buying power, 5xx.
**Expected Results:** Each normalized correctly — user-fixable → clean REJECTED; transient → RETRY_PENDING; non-fractionable → whole-share retry.

---
```yaml
id: TC-BRK-001-026
title: Fractional quantity support and whole-share rounding (Alpaca)
primary_func_id: BRK-001
related_func_ids: [COPY-001]
module: brokers
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_026_fractional_rounding.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, boundary, destructive, requires-fake-broker, P1]
source_refs: [backend/app/brokers/alpaca.py (supports_fractional), copy_engine._scale_quantity, api/trades.py (non-fractionable → whole retry)]
evidence_requirements: [Fractional account accepts fractional qty; non-fractionable rejection triggers whole-share retry (audit order.rounded_to_whole)]
```
**Steps:** 1) Place a fractional qty on a fractional account. 2) Force a non-fractionable rejection → whole-share retry.
**Expected Results:** Fractional accepted where supported; otherwise rounded down to whole and retried once; audited.

---
```yaml
id: TC-TRADE-004-006
title: Alpaca-specific native bracket behavior (stocks) — single OTOCO/OTO, GTC
primary_func_id: TRADE-004
related_func_ids: [COPY-004]
module: brokers
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_trade_004_006_alpaca_native_bracket.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, destructive, requires-fake-broker, P1]
source_refs: [backend/app/brokers/alpaca.py (_uses_native_bracket stocks only; BRACKET/OTOCO/OTO, forces GTC), baseline §15]
evidence_requirements: [Alpaca STOCK entry with TP+SL → native bracket; option → emulator (no native); modify post-fill native → 501]
```
**Steps:** 1) Alpaca stock entry with TP+SL. 2) Alpaca option with TP+SL. 3) Modify a filled native bracket.
**Expected Results:** Stock uses native bracket (GTC); option uses the emulator (native rejected, error 42210000); post-fill native modify → 501 (see TC-TRADE-004-004).

---
```yaml
id: TC-BRK-001-027
title: Alpaca API timeout and rate limiting during connect/verify are handled cleanly
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_027_alpaca_timeout_ratelimit.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/brokers/alpaca.py (SDK default timeout — baseline flags no explicit timeout), broker_concurrency_alpaca]
evidence_requirements: [Timeout → clean error + rollback; 429 rate-limit → surfaced, not silently swallowed]
```
**Steps:** 1) Fake Alpaca timeout on verify. 2) Fake 429.
**Expected Results:** Both surface a clean error and roll back; note baseline: no explicit SDK timeout is set (relies on defaults) — record as an observation.

---
```yaml
id: TC-BRK-001-028
title: Paper-suite authorization guard — the Alpaca paper suite is manual-only and disabled by default
primary_func_id: BRK-001
related_func_ids: [AUTHZ-001]
module: brokers
test_level: L2
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_028_paper_suite_guard.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, security, paper, P0]
source_refs: [automation/common/safety.ts::assertPaperSuiteAllowed]
evidence_requirements: [Paper suite refuses to run unless BROKER_MODE=paper AND PAPER_SUITE_AUTHORIZED=true AND non-prod]
```
**Steps:** 1) Attempt the paper suite without authorization / with default config.
**Expected Results:** `assertPaperSuiteAllowed` throws unless explicitly authorized; never runs in automatic pipelines. Real-money-adjacent safety (P0).

---
```yaml
id: TC-BRK-001-029
title: The automated suite never connects to a real-money account (guard verification)
primary_func_id: BRK-001
related_func_ids: [AUTHZ-001]
module: brokers
test_level: L2
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_029_no_real_money.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, security, P0]
source_refs: [automation/common/safety.ts (assertDestructiveAllowed requires broker=fake; paper is contract-only)]
evidence_requirements: [No suite can drive a live/funded account; destructive suites require broker=fake; paper is read/contract-only]
```
**Steps:** 1) Static + runtime assertion across suites: destructive requires fake; paper is limited to contract validation.
**Expected Results:** No automated path connects/drives a real-money account. Real-money safety (P0).
```
