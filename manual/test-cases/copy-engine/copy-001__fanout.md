# COPY-001 — Copy-trading fanout

Parent: **COPY-001**, workflows **WF-10/WF-11**. Source: `backend/app/services/copy_engine.py`
(`fanout_async`, phases 1–3, `_scale_quantity`, close-detection/clamp, symbol filters, per-broker
semaphore), `backend/app/services/cache.py` (subscribers cache), `backend/app/models/order.py`.

**Environment:** `[local-qa]` with **BROKER_MODE=fake**; subscribers seeded via admin load-test API.
All order-producing cases are `@destructive` (fake broker, non-prod). **Never production.**

---
```yaml
id: TC-COPY-001-001
title: A trader fill fans out to every active subscriber as one mirror order each
primary_func_id: COPY-001
related_func_ids: [TRADE-001, WF-10]
module: copy-engine
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/fanout.spec.ts (TC-COPY-001-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, destructive, requires-fake-broker, requires-seed, P0]
source_refs: [backend/app/services/copy_engine.py::fanout_async]
evidence_requirements: [N active subscribers → exactly N child mirror orders (parent_order_id set), one per sub]
```
**Preconditions:** 1 trader (fake broker); N subscribers following, `copy_enabled=true`, each with a fake broker.
**Steps:** 1) Trader places/fills an order. 2) Inspect child orders.
**Expected Results:** Exactly N mirror orders created (each `parent_order_id`=trader order), no duplicates, no missing subscribers.

---
```yaml
id: TC-COPY-001-002
title: Quantity scaling by multiplier (fractional truncation vs whole-share floor)
primary_func_id: COPY-001
related_func_ids: [RISK-003]
module: copy-engine
test_level: L2
test_type: Boundary
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/fanout.spec.ts (TC-COPY-001-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, boundary, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py::_scale_quantity]
evidence_requirements: [Scaled qty = trader_qty × multiplier; fractional-capable broker truncates 6dp, else floors to whole]
```
**Test Data:** trader qty 10; subscribers with multipliers 0.5, 1.0, 2.0, 0.33; fractional and non-fractional fake brokers.
**Steps:** 1) Trader order qty 10. 2) Check each mirror's quantity.
**Expected Results:** Correct scaling; non-fractional broker floors to whole shares; fractional truncates to 6dp ROUND_DOWN; `scaled ≤ 0` → skipped (no zero-qty order).

---
```yaml
id: TC-COPY-001-003
title: Copy disabled / trader paused — no mirror is produced
primary_func_id: COPY-001
related_func_ids: [RISK-001, SUB-001]
module: copy-engine
test_level: L2
test_type: Negative
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/fanout.spec.ts (TC-COPY-001-003)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py::fanout_async (copy_paused, copy_enabled gates)]
evidence_requirements: [Subscriber with copy_enabled=false → no mirror; trader copy_paused → no fanout at all]
```
**Steps:** 1) Case A: subscriber copy off. 2) Case B: trader `copy_paused=true`. 3) Trader places order.
**Expected Results:** A: that subscriber gets no mirror; others do. B: no mirrors at all.

---
```yaml
id: TC-COPY-001-004
title: Symbol filters — excluded symbol not mirrored; inclusion list enforced
primary_func_id: COPY-001
related_func_ids: [RISK-004]
module: copy-engine
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/fast-follow.spec.ts (TC-COPY-001-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, requires-fake-broker, destructive, P1]
source_refs: [backend/app/services/copy_engine.py (symbol exclusion/inclusion), RISK-004 settings]
evidence_requirements: [Excluded symbol → no mirror; with inclusion list, only listed symbols mirror]
```
**Steps:** 1) Subscriber excludes TSLA. 2) Trader trades TSLA then AAPL. 3) Subscriber with inclusion=[AAPL] — trader trades MSFT.
**Expected Results:** TSLA not mirrored; AAPL mirrored; with inclusion list, MSFT not mirrored.

---
```yaml
id: TC-COPY-001-005
title: Subscriber with no connected broker is skipped cleanly (no crash)
primary_func_id: COPY-001
related_func_ids: []
module: copy-engine
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/fanout.spec.ts (TC-COPY-001-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, negative, requires-fake-broker, destructive, P1]
source_refs: [backend/app/services/copy_engine.py (skipped_no_broker)]
evidence_requirements: [No mirror for the broker-less subscriber; fanout continues for others]
```
**Steps:** 1) One subscriber has no connected broker. 2) Trader places order.
**Expected Results:** That subscriber is skipped (`skipped_no_broker`); other subscribers still mirror; no exception.

---
```yaml
id: TC-COPY-001-006
title: Per-subscriber isolation — one broker failure does not abort the whole fanout
primary_func_id: COPY-001
related_func_ids: []
module: copy-engine
test_level: L3
test_type: Recovery
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_001_006_isolation.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, recovery, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py (Phase 2 per-task exception isolation)]
evidence_requirements: [One subscriber's fake broker errors; the rest still receive correct mirrors]
```
**Preconditions:** Several subscribers; one fake broker set to error.
**Steps:** 1) Trader places order.
**Expected Results:** Failing subscriber's mirror is REJECTED/retried; all other subscribers get correct mirrors (no cascade abort).

---
```yaml
id: TC-COPY-001-007
title: Batched vs per-iteration path parity at the fanout threshold (boundary)
primary_func_id: COPY-001
related_func_ids: [ADMIN-005]
module: copy-engine
test_level: L3
test_type: Boundary
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_001_007_batch_threshold.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, boundary, requires-seed, destructive, P2]
source_refs: [backend/app/services/copy_engine.py (fanout_batch_threshold), services/platform_config.py]
evidence_requirements: [Below and at/above threshold produce identical mirror set + counts]
```
**Test Data:** threshold=75 (env/Redis). Seed 74 then 76 subscribers.
**Steps:** 1) Fan out with 74 subs (per-iteration). 2) With 76 subs (batched).
**Expected Results:** Same correctness (one correct mirror per active sub) on both paths; only latency profile differs.

---
```yaml
id: TC-COPY-001-008
title: Emulated bracket exit legs are NOT broadcast to subscribers (data integrity)
primary_func_id: COPY-001
related_func_ids: [COPY-004]
module: copy-engine
test_level: L3
test_type: Data-Integrity
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_001_008_bracket_parent_guard.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py::fanout_async (bracket_parent_id guard), baseline §12.1]
evidence_requirements: [A trader bracket exit leg does not create subscriber mirrors; only the entry fans out]
```
**Steps:** 1) Trader entry with TP/SL fills; emulator fires exit legs. 2) Inspect subscriber mirrors.
**Expected Results:** Only the entry produced mirrors; the emulated exit legs (`bracket_parent_id` set) are not broadcast — no spurious subscriber orders.

---
```yaml
id: TC-COPY-001-009
title: Fanout records audit + per-order performance timestamps
primary_func_id: COPY-001
related_func_ids: [PERF-001]
module: copy-engine
test_level: L3
test_type: Data-Integrity
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/fast-follow.spec.ts (TC-COPY-001-009)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, requires-fake-broker, destructive, P2]
source_refs: [backend/app/api/trades.py (trader.fanout_complete), backend/app/models/order.py (lifecycle timestamps)]
evidence_requirements: [audit trader.fanout_complete; child orders carry subscriber_picked_at/accepted_at/broker_call_ms]
```
**Steps:** 1) Trader order fans out. 2) Inspect audit + child order lifecycle timestamps.
**Expected Results:** `audit trader.fanout_complete`; mirror orders carry populated lifecycle timestamps feeding PERF-001; `fanned_out_to_subscribers=true` only when copy was active.

---
```yaml
id: TC-COPY-001-010
title: Anti-doubling invariant — cancel_order()==False aborts re-place (no duplicate buy)
primary_func_id: COPY-001
related_func_ids: [TRADE-004, COPY-003]
module: copy-engine
test_level: L3
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_001_010_cancel_bail_no_double.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, concurrency, destructive, requires-fake-broker, P0]
source_refs:
  - backend/app/services/copy_engine.py::_modify_place_one / force_fill_mirrors_to_market (cancel==False → bail)
  - baseline §12.1 (META double-buy fix)
evidence_requirements: [When a cancel returns False (order already terminal/filled), NO replacement order is placed]
```
**Preconditions:** Fake broker where a mirror order is already terminal (filled) when a modify/force-fill tries to cancel it.
**Steps:** 1) Trigger a modify/force-fill on a mirror whose cancel returns False (already filled).
**Expected Results:** The engine **bails** — it does **not** place a replacement (prevents the documented double-buy). Exactly one position results. Core financial-safety invariant.
```
