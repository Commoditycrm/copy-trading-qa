# COPY-002 — Close detection & quantity clamping

Parent: **COPY-002** (baseline §29). Source: `backend/app/services/copy_engine.py`
(`is_closing_effective`, `_closeable_quantity`, close-clamp block, `_has_working_entry_for_contract`,
`_has_filled_entry_for_contract`, audit `copy.close_entry_pending_no_clamp`),
`backend/app/services/order_retry.py::live_closeable_quantity`, `backend/app/services/retry_scheduler.py`.
Baseline refs §12.1, §27, §15.2 (NDXP fill-sync race).

**Environment:** `[local-qa]` with **BROKER_MODE=fake**. All order-producing cases are `@destructive`
(fake broker + non-prod). **Never production.** Close detection is critical because SnapTrade/Webull
report every action as plain BUY/SELL (`is_closing=false`), so closes are inferred from held position.

---
```yaml
id: TC-COPY-002-001
title: SnapTrade/Webull close represented as BUY against a short position is detected as a close
primary_func_id: COPY-002
related_func_ids: [COPY-001]
module: copy-engine
test_level: L3
test_type: Functional
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_001_buy_closes_short.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py::is_closing_effective, _closeable_quantity]
evidence_requirements: [BUY on a held SHORT is treated as closing (reduces the short), not opening a new long]
```
**Preconditions:** Subscriber holds a SHORT position in SYM (fake broker); trader emits a BUY on SYM with `is_closing=false` (SnapTrade/Webull shape).
**Steps:** 1) Fan out the trader BUY.
**Expected Results:** Detected as a **close** (reduces the short by the closeable qty); does not open a new long beyond the held short.

---
```yaml
id: TC-COPY-002-002
title: SnapTrade/Webull close represented as SELL against a long position is detected as a close
primary_func_id: COPY-002
related_func_ids: [COPY-001]
module: copy-engine
test_level: L3
test_type: Functional
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_002_sell_closes_long.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py::is_closing_effective]
evidence_requirements: [SELL on a held LONG is treated as closing, not opening a new short]
```
**Preconditions:** Subscriber holds a LONG in SYM; trader emits SELL (`is_closing=false`).
**Steps:** 1) Fan out.
**Expected Results:** Detected as a close (reduces the long); no new short opened beyond held.

---
```yaml
id: TC-COPY-002-003
title: Close quantity equal to held quantity flattens the position exactly
primary_func_id: COPY-002
related_func_ids: []
module: copy-engine
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_003_close_equal_held.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (close clamp)]
evidence_requirements: [Resulting position = flat; mirror close qty = held]
```
**Preconditions:** Subscriber holds qty H; scaled close qty resolves to H.
**Steps:** 1) Fan out the close.
**Expected Results:** Position flat; close order qty = H (no over/under-close).

---
```yaml
id: TC-COPY-002-004
title: Close quantity greater than held is clamped to held (no over-close / no flip)
primary_func_id: COPY-002
related_func_ids: []
module: copy-engine
test_level: L3
test_type: Data-Integrity
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/positions-close.spec.ts (TC-COPY-002-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py (clamp to held), order_retry.live_closeable_quantity]
evidence_requirements: [Close qty clamped to held; position ends flat, never flips to opposite side]
```
**Preconditions:** Subscriber holds H; scaled close resolves to > H.
**Steps:** 1) Fan out the oversized close.
**Expected Results:** Clamped to H; position flat; **never** flips into an opposite-side position. Core financial-safety invariant.

---
```yaml
id: TC-COPY-002-005
title: Close quantity smaller than held performs a partial close, remainder retained
primary_func_id: COPY-002
related_func_ids: []
module: copy-engine
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_005_partial_close.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (partial close)]
evidence_requirements: [Close qty < held → position reduced by that amount; remainder still held]
```
**Steps:** 1) Fan out a partial close (< held).
**Expected Results:** Position reduced by the close qty; remainder retained; no over-close.

---
```yaml
id: TC-COPY-002-006
title: Zero held quantity — genuine no-position close is skipped (no negative/short opened)
primary_func_id: COPY-002
related_func_ids: []
module: copy-engine
test_level: L3
test_type: Negative
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/positions-close.spec.ts (TC-COPY-002-006)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, negative, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py (closeable=0 → skipped_zero_qty), _closeable_quantity]
evidence_requirements: [With truly zero held and no working/filled entry, the close is skipped — NOT converted to a new short]
```
**Preconditions:** Subscriber holds **0** of SYM and has no working/filled entry for it.
**Steps:** 1) Trader closes SYM; fan out.
**Expected Results:** `skipped_zero_qty` — no order placed; the close does **not** open a new opposite position. (Contrast TC-COPY-002-009 fill-sync race.)

---
```yaml
id: TC-COPY-002-007
title: Broker position read unavailable — engine does NOT clamp (fails safe, no wrong-size close)
primary_func_id: COPY-002
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
automation_ref: automation/integration/test_tc_copy_002_007_broker_positions_unavailable.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, recovery, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/order_retry.py::live_closeable_quantity (returns None on read failure — caller must NOT clamp)]
evidence_requirements: [When get_positions fails/returns None, the engine does not clamp to 0/wrong size; it defers or skips safely]
```
**Preconditions:** Fake broker `get_positions` errors/returns None during the close.
**Steps:** 1) Fan out a close while positions are unreadable.
**Expected Results:** Engine treats closeable as unknown (None) — it does **not** clamp to zero or a wrong size; the close is deferred/skipped rather than mis-sized. No incorrect flatten.

---
```yaml
id: TC-COPY-002-008
title: Stale local position vs live broker position — live broker holding is the source of truth
primary_func_id: COPY-002
related_func_ids: [JOB-012]
module: copy-engine
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_008_stale_local_vs_live.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/order_retry.py::live_closeable_quantity (broker-live), copy_engine close path]
evidence_requirements: [Clamp uses the LIVE broker quantity, not a stale DB-derived quantity]
```
**Preconditions:** DB-derived local position (e.g. 10) diverges from live broker holding (e.g. 6).
**Steps:** 1) Fan out a close.
**Expected Results:** Close clamped to the **live** broker qty (6), not the stale local (10) — no over-close from stale state.

---
```yaml
id: TC-COPY-002-009
title: Fill-sync race — clamp must NOT reduce to zero when an entry is working/filled-unsynced
primary_func_id: COPY-002
related_func_ids: [COPY-001]
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
automation_ref: automation/integration/test_tc_copy_002_009_fill_sync_race_no_clamp.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, concurrency, destructive, requires-fake-broker, P0]
source_refs:
  - backend/app/services/copy_engine.py (_has_working_entry_for_contract, _has_filled_entry_for_contract, audit copy.close_entry_pending_no_clamp)
  - baseline §12.1, §15.2 (NDXP 22-Jul race)
evidence_requirements: [When held shrinks to 0 only because the entry fill hasn't synced yet, the close is NOT clamped away; is_closing forced true; audit copy.close_entry_pending_no_clamp]
```
**Preconditions:** Subscriber's same-contract entry is still working OR filled-but-unsynced (`filled_quantity` lagging) while the trader closes.
**Steps:** 1) Fan out the close during the fill-sync window.
**Expected Results:** Engine does **not** clamp the close to zero (it recognizes the pending/lagging entry); forces `is_closing=true`; audits `copy.close_entry_pending_no_clamp`. Prevents the stranded-position bug.

---
```yaml
id: TC-COPY-002-010
title: Fractional held quantity — close clamp truncates correctly (fractional broker)
primary_func_id: COPY-002
related_func_ids: []
module: copy-engine
test_level: L2
test_type: Boundary
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_010_fractional_held.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, boundary, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py::_scale_quantity (fractional truncate 6dp ROUND_DOWN), close clamp]
evidence_requirements: [Fractional held (e.g. 3.5) close resolves to a valid fractional qty ≤ held, truncated 6dp]
```
**Preconditions:** Fractional-capable fake broker; subscriber holds a fractional qty (e.g. 3.500000).
**Steps:** 1) Fan out a close.
**Expected Results:** Close qty truncated to ≤ held at 6dp ROUND_DOWN; no over-close via rounding.

---
```yaml
id: TC-COPY-002-011
title: Whole-share broker — close clamp floors to whole shares
primary_func_id: COPY-002
related_func_ids: []
module: copy-engine
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_011_whole_share_floor.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, boundary, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py::_scale_quantity (floor to whole)]
evidence_requirements: [Non-fractional broker floors the close qty to whole shares ≤ held]
```
**Preconditions:** Non-fractional fake broker; scaled close is fractional.
**Steps:** 1) Fan out a close.
**Expected Results:** Close qty floored to a whole number ≤ held; `scaled ≤ 0` → skipped.

---
```yaml
id: TC-COPY-002-012
title: Option-contract close — quantity is in contracts and clamps to held contracts
primary_func_id: COPY-002
related_func_ids: [COPY-004]
module: copy-engine
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_012_option_close_qty.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (option close), positions._option_close_limit]
evidence_requirements: [Option close qty in whole contracts, clamped to held contracts; placed as marketable LIMIT]
```
**Preconditions:** Subscriber holds N option contracts.
**Steps:** 1) Trader closes the option; fan out.
**Expected Results:** Close qty = whole contracts ≤ N; option close placed as a marketable LIMIT (never MARKET).

---
```yaml
id: TC-COPY-002-013
title: Concurrent close attempts on the same contract do not double-close
primary_func_id: COPY-002
related_func_ids: [TRADE-001]
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
automation_ref: automation/integration/test_tc_copy_002_013_concurrent_close.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, concurrency, destructive, requires-fake-broker, P0]
source_refs: [backend/app/api/trades.py::_place_trader_order (advisory lock + 3s dedup), copy_engine conflict-resolve]
evidence_requirements: [Two near-simultaneous closes on the same held contract net to at most one full close; position not driven negative]
```
**Steps:** 1) Fire two concurrent closes for the same held contract.
**Expected Results:** Dedup/advisory lock + live re-clamp ensure the position is closed at most once (flat), never over-closed into a short.

---
```yaml
id: TC-COPY-002-014
title: Retry of a close order preserves is_closing=true and uses the close retry interval (positive)
primary_func_id: COPY-002
related_func_ids: [COPY-003]
module: copy-engine
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_014_retry_preserves_is_closing.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/retry_scheduler.py::_passes_gates (retry_interval_close when is_closing)]
evidence_requirements: [A RETRY_PENDING close retries as a close (is_closing=true) and consults retry_interval_close]
```
**Preconditions:** A close mirror is RETRY_PENDING (transient error) with `is_closing=true` preserved.
**Steps:** 1) Let the scheduler retry the close.
**Expected Results:** Retry keeps `is_closing=true` and uses `retry_interval_close`; re-clamps to live held qty. (Positive/expected path — contrast TC-COPY-002-015.)

---
```yaml
id: TC-COPY-002-015
title: Transient retry path — Potential defect where is_closing may reset to false
primary_func_id: COPY-002
related_func_ids: [COPY-003]
module: copy-engine
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
defect_status: Potential
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_015_is_closing_reset_potential.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py:2510 (is_closing=False on transient retry — TODO), baseline §27]
evidence_requirements: [Observe whether a closing mirror retried via the transient path loses is_closing and is mis-gated on the open interval]
```
**Steps:** 1) Copied CLOSE → inject a transient (5xx) broker error → transient retry path. 2) Inspect the retried order's `is_closing` and which retry interval was consulted.
**Expected Results (intended):** `is_closing` stays true; close interval used.
**Known/Potential defect (baseline §27):** the transient-retry path may reset `is_closing=false`. `defect_status: Potential` — **do NOT mark Confirmed unless reproduced TWICE** in QA (DEFECT_MANAGEMENT_PROCESS §7). If not reproduced or env/test-data caused, classify and update Expected Result + VERIFICATION_NOTES. (Paired with TC-COPY-003-007.)

---
```yaml
id: TC-COPY-002-016
title: Data integrity — close writes one child order, correct fill linkage, broker request, and audit
primary_func_id: COPY-002
related_func_ids: [TRADE-001]
module: copy-engine
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_002_016_close_data_integrity.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/models/order.py, backend/app/services/audit.py, copy_engine close path]
evidence_requirements: [One close child order (is_closing=true, parent set); broker request qty = clamped qty; fills sum ≤ held; audit records present]
```
**Steps:** 1) Fan out a close. 2) Query child order + fills + broker request + audit.
**Expected Results:** Exactly one close child order (`is_closing=true`, `parent_order_id` set); broker request quantity equals the clamped quantity; fills reconcile (no over-fill/double-count); audit trail present.

---
```yaml
id: TC-COPY-002-017
title: Cross-subscriber isolation — clamp uses each subscriber's own held position
primary_func_id: COPY-002
related_func_ids: [COPY-001]
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
automation_ref: automation/integration/test_tc_copy_002_017_cross_subscriber_isolation.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, requires-seed, P0]
source_refs: [backend/app/services/copy_engine.py (_closeable_quantity per subscriber account)]
evidence_requirements: [Each subscriber's close clamps to THEIR own held qty; one sub's holding never affects another's clamp]
```
**Preconditions:** Two subscribers with different held quantities of SYM (e.g. 3 and 10).
**Steps:** 1) Trader closes SYM; fan out.
**Expected Results:** Sub A closes 3, Sub B closes 10 — each clamped to its own live holding; no cross-contamination.

---
```yaml
id: TC-COPY-002-018
title: Broker rejection after clamp — mirror is REJECTED (or retried per policy), position unchanged
primary_func_id: COPY-002
related_func_ids: [COPY-003]
module: copy-engine
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/trading/broker-lifecycle.spec.ts (TC-COPY-002-018)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, recovery, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (Phase 3 error routing), order_retry.classify_error]
evidence_requirements: [After a valid clamp, a broker rejection → REJECTED (user-fixable) or RETRY_PENDING (transient); held position unchanged; audit/notify]
```
**Preconditions:** Close clamped correctly; fake broker rejects the close.
**Steps:** 1) Fan out a close the broker will reject.
**Expected Results:** Clamp is correct but the order is REJECTED (user-fixable) or RETRY_PENDING (transient, if opted-in); the held position is not mutated; audit + rejection notification recorded.
```
