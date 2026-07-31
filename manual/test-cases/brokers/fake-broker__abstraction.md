# Fake broker & broker abstraction (Stage 5)

Primary **BRK-001** (fake broker connect/usage — continues at 038), **TRADE-001** (cross-broker error
normalization). Source: `backend/app/brokers/fake.py` (FakeBrokerAdapter, MOCK_BROKER_* profiles),
`backend/app/brokers/base.py` (BrokerAdapter ABC), `backend/app/brokers/__init__.py::adapter_for`,
`backend/app/services/order_retry.py::classify_error`, `automation/common/safety.ts`.

**Environment:** `[local-qa]` **BROKER_MODE=fake**. `@destructive` where orders are placed (no real broker). **Never production.**

---
```yaml
id: TC-BRK-001-038
title: Fake broker connection and usage — place_order returns synthetic SUBMITTED, sends nothing external
primary_func_id: BRK-001
related_func_ids: [ADMIN-004]
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
automation_ref: automation/integration/test_tc_brk_001_038_fake_usage.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, fake, destructive, requires-fake-broker, P1, regression]
source_refs: [backend/app/brokers/fake.py::place_order/get_order, backend/app/brokers/__init__.py::adapter_for (BrokerName.FAKE), scripts/seed_fake_subscribers.py]
evidence_requirements: [Fake order returns synthetic SUBMITTED (then FILLED via get_order); NOTHING is sent to any real broker]
```
**Steps:** 1) Seed a fake subscriber (admin load-test). 2) Fan out / place a fake order.
**Expected Results:** Synthetic SUBMITTED→FILLED; no external broker call; enables full lifecycle testing without real money.

---
```yaml
id: TC-BRK-001-039
title: Fake broker latency profiles — flat, jitter, slow-probability
primary_func_id: BRK-001
related_func_ids: [PERF-001]
module: brokers
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_039_latency_profiles.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, fake, destructive, requires-fake-broker, P2]
source_refs: [backend/app/brokers/fake.py (MOCK_BROKER_PROFILE flat/realistic, MOCK_BROKER_LATENCY_MS, MOCK_BROKER_JITTER_MS, MOCK_BROKER_SLOW_PROBABILITY, MOCK_BROKER_SLOW_LATENCY_MS)]
evidence_requirements: [flat profile ≈ fixed latency; jitter adds variance; slow-probability occasionally injects the slow latency]
```
**Steps (data-driven via env):** 1) flat + latency=300. 2) realistic + jitter. 3) slow_probability=1.0 → slow latency applied.
**Expected Results:** Latency behavior matches each profile (re-read per call); feeds performance/fanout-latency tests.

---
```yaml
id: TC-BRK-001-040
title: Fake broker forced rejection and forced timeout
primary_func_id: BRK-001
related_func_ids: [COPY-003]
module: brokers
test_level: L2
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_040_forced_errors.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, fake, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/brokers/fake.py (error/slow injection)]
evidence_requirements: [Forced rejection → REJECTED path; forced timeout → transient/RETRY_PENDING path; deterministic under config]
```
**Steps:** 1) Configure the fake broker to reject. 2) Configure it to time out.
**Expected Results:** Rejection drives the REJECTED path; timeout drives the transient/retry path — enabling COPY-003 / recovery tests deterministically.

---
```yaml
id: TC-BRK-001-041
title: Deterministic fake-broker test-data behavior (reserved email pattern, seed/cleanup)
primary_func_id: BRK-001
related_func_ids: [ADMIN-004]
module: brokers
test_level: L2
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_041_deterministic_data.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, fake, data-integrity, requires-seed, destructive, P1]
source_refs: [backend/app/brokers/fake.py (fake-load-test-*@example.invalid guard), backend/app/api/admin.py (seed/cleanup)]
evidence_requirements: [Seeded fake subscribers use the reserved email pattern; cleanup removes exactly them; deterministic per run id]
```
**Steps:** 1) Seed N fake subscribers. 2) Cleanup.
**Expected Results:** Reserved `fake-load-test-*@example.invalid` pattern; deterministic seed/cleanup scoped to the run; no real data touched.

---
```yaml
id: TC-BRK-001-042
title: Broker adapter interface consistency — all adapters honor the base contract
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L2
test_type: Data-Integrity
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_042_adapter_interface.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [brokers, data-integrity, P1]
source_refs: [backend/app/brokers/base.py (BrokerAdapter ABC; abstractmethods verify_connection/place_order/get_order), __init__.py::adapter_for]
evidence_requirements: [adapter_for maps ALPACA/SNAPTRADE/IBKR/FAKE; WEBULL not routed (ValueError); required abstract methods implemented; unimplemented ones raise NotImplementedError]
```
**Steps:** 1) Enumerate adapters via `adapter_for` for each BrokerName.
**Expected Results:** ALPACA/SNAPTRADE/IBKR/FAKE routed; WEBULL raises (not routed); each concrete adapter implements the abstract contract; optional methods raise NotImplementedError where unsupported.

---
```yaml
id: TC-BRK-001-043
title: Unsupported broker operation raises NotImplementedError (cancel/replace/positions per adapter)
primary_func_id: BRK-001
related_func_ids: [TRADE-004]
module: brokers
test_level: L2
test_type: Negative
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_043_unsupported_op.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [brokers, negative, P2]
source_refs: [backend/app/brokers/base.py (default NotImplementedError for replace_order/get_positions/get_pnl_snapshot), snaptrade/ibkr adapters]
evidence_requirements: [Calling an unsupported op (e.g. SnapTrade replace_order) raises NotImplementedError, not a silent wrong result]
```
**Steps:** 1) Invoke an unsupported adapter method (SnapTrade `replace_order`, IBKR `get_pnl_snapshot`).
**Expected Results:** NotImplementedError (explicit) — callers fall back correctly; no silent misbehavior.

---
```yaml
id: TC-BRK-001-044
title: Fake broker is REQUIRED for destructive CI, and can never be assigned to a real account
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
automation_ref: automation/api/tests/brokers/test_tc_brk_001_044_fake_required_guard.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, fake, security, P0]
source_refs: [automation/common/safety.ts::assertDestructiveAllowed, backend/app/brokers/fake.py (NEVER USE IN PRODUCTION guard), baseline §18]
evidence_requirements: [Destructive suites require broker=fake; a real subscriber must never be assignable broker=fake (would silently no-op real orders)]
```
**Steps:** 1) Attempt a destructive test with a non-fake broker → guard throws. 2) Verify (app-side) no path assigns `broker=fake` to a real (non-load-test) account.
**Expected Results:** `assertDestructiveAllowed` requires `broker=fake`; the fake broker is confined to reserved load-test accounts. If a real account can be flagged fake, raise as **Potential** (baseline §18). Fake-broker-guard integrity (P0).

---
```yaml
id: TC-BRK-001-045
title: Guard prevents fake/destructive tests from running against production
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
automation_ref: automation/api/tests/brokers/test_tc_brk_001_045_prod_guard.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, fake, security, P0]
source_refs: [automation/common/safety.ts (assertDestructiveAllowed / assertRequestAllowed reject prod; global-setup fails fast if prod + broker!=none)]
evidence_requirements: [With env=prod, destructive/fake tests refuse to run; prod requires BROKER_MODE=none (global-setup enforces)]
```
**Steps:** 1) Set env=prod with a destructive/fake test.
**Expected Results:** `global-setup` and `assertDestructiveAllowed` block it; production only permits read-only smoke. Fake-broker-guard-bypass prevention (P0).

---
```yaml
id: TC-TRADE-001-013
title: Cross-broker error normalization is consistent across adapter error shapes
primary_func_id: TRADE-001
related_func_ids: [COPY-003, BRK-001]
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
automation_ref: automation/integration/test_tc_trade_001_013_cross_broker_normalization.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/order_retry.py::classify_error / is_order_conflict_error (Alpaca + Webull/SnapTrade code-1119 vocab)]
evidence_requirements: [Equivalent errors from Alpaca-style vs SnapTrade/Webull-style shapes classify identically (user-fixable vs transient vs conflict)]
```
**Steps (data-driven):** feed Alpaca-shaped and SnapTrade/Webull-shaped equivalents of wash-trade, insufficient-qty, transient 5xx.
**Expected Results:** `classify_error` normalizes them consistently across brokers — same routing (clean reject / retry / conflict-resolve) regardless of broker vocabulary.
