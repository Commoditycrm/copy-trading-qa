# TRADE-004 / COPY-004 — Bracket behavior (TP/SL, OCO, emulation)

Parent: **TRADE-004** (modify bracket) and **COPY-004** (bracket/OCO emulation), workflow **WF-15**.
Source: `backend/app/api/trades.py::update_bracket`, `backend/app/services/bracket_emulator.py`
(`emulate_bracket_exits`, `cancel_sibling_on_fill`, `_reanchor_exit_price`),
`backend/app/services/trader_bracket_monitor.py`, `backend/app/brokers/alpaca.py` (native bracket, stocks).

**Environment:** `[local-qa]` with **BROKER_MODE=fake**. Order-mutating cases `@destructive`.

---
```yaml
id: TC-TRADE-004-001
title: Attach TP/SL on an entry order (native for Alpaca stock; emulated otherwise)
primary_func_id: TRADE-004
related_func_ids: [TRADE-001, COPY-004]
module: trading
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_004_001_attach_bracket.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, destructive, requires-fake-broker, P1]
source_refs: [POST /api/trades (bracket), backend/app/brokers/alpaca.py (_uses_native_bracket stocks)]
evidence_requirements: [Entry with TP+SL; Alpaca stock → native bracket; other → emulator on fill]
```
**Steps:** 1) Place a stock entry with TP+SL (valid geometry).
**Expected Results:** Alpaca stock uses a native bracket (GTC); non-native brokers defer exits to the emulator on fill.

---
```yaml
id: TC-TRADE-004-002
title: Modify bracket pre-fill is a DB-only update (audit bracket.updated_pre_fill)
primary_func_id: TRADE-004
related_func_ids: []
module: trading
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_004_002_modify_prefill.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, destructive, requires-fake-broker, P2]
source_refs: [PATCH /api/trades/{order_id}/bracket, backend/app/api/trades.py::update_bracket]
evidence_requirements: [Pre-fill modify updates DB TP/SL; audit bracket.updated_pre_fill]
```
**Steps:** 1) PATCH bracket on an unfilled entry (change TP and/or SL).
**Expected Results:** DB TP/SL updated; `audit bracket.updated_pre_fill`; no broker leg placed yet.

---
```yaml
id: TC-TRADE-004-003
title: Modify bracket post-fill cancels alive legs and re-places via emulator
primary_func_id: TRADE-004
related_func_ids: [COPY-004]
module: trading
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_trade_004_003_modify_postfill.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, trading, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/trades.py::update_bracket (post-fill), bracket_emulator.emulate_bracket_exits]
evidence_requirements: [Alive legs cancelled; new legs re-placed; audit bracket.updated_post_fill]
```
**Steps:** 1) Entry fills, exits placed. 2) PATCH bracket to new TP/SL.
**Expected Results:** Changed alive legs cancelled and re-placed; `audit bracket.updated_post_fill`.

---
```yaml
id: TC-TRADE-004-004
title: Alpaca native stock bracket modify post-fill returns 501 (unimplemented)
primary_func_id: TRADE-004
related_func_ids: []
module: trading
test_level: L2
test_type: Negative
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_004_004_native_modify_501.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, negative, destructive, requires-fake-broker, P2]
source_refs: [backend/app/api/trades.py::update_bracket (Alpaca native → 501), baseline §15]
evidence_requirements: [501 alpaca_native_bracket_modify_not_supported]
```
**Steps:** 1) Modify the bracket of a FILLED Alpaca-native stock bracket.
**Expected Results:** 501 `alpaca_native_bracket_modify_not_supported` (child leg ids not persisted) — documents the known limitation.

---
```yaml
id: TC-TRADE-004-005
title: Bracket modify geometry & entry-only/ownership guards
primary_func_id: TRADE-004
related_func_ids: [AUTHZ-001]
module: trading
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/trading/test_tc_trade_004_005_modify_guards.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, trading, boundary, permission, negative, P1]
source_refs: [backend/app/api/trades.py::update_bracket (geometry 422; entry-only 409; owner 404)]
evidence_requirements: [422 on inverted geometry; 409 cannot_modify_bracket_leg (targeting a leg); 404 for another user's order]
```
**Steps (data-driven):** 1) Modify with tp below entry (buy) → 422. 2) Target a bracket leg instead of entry → 409. 3) Another user's order → 404. 4) ≥1 leg required → 422 if none.
**Expected Results:** As annotated.

---
```yaml
id: TC-COPY-004-001
title: Option STOP leg is deferred to the monitor, not sent to the broker (data integrity)
primary_func_id: COPY-004
related_func_ids: [RISK-003]
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
automation_ref: automation/integration/test_tc_copy_004_001_option_stop_deferred.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/bracket_emulator.py (option STOP → bracket.sl_deferred_to_monitor), trader_bracket_monitor.py]
evidence_requirements: [No option STOP order at broker; audit bracket.sl_deferred_to_monitor; monitor enforces SL]
```
**Steps:** 1) Copied option position with an SL. 2) Inspect broker orders + audit.
**Expected Results:** No resting option STOP at the broker (rejected type); SL deferred to `trader_bracket_monitor`; `audit bracket.sl_deferred_to_monitor`.

---
```yaml
id: TC-COPY-004-002
title: OCO — when one exit leg fills, the sibling is cancelled and the trader is notified
primary_func_id: COPY-004
related_func_ids: [NOTIF-001]
module: copy-engine
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_copy_004_002_oco_sibling_cancel.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/bracket_emulator.py::cancel_sibling_on_fill]
evidence_requirements: [TP fill → SL cancelled (and vice-versa); no double exit; trader notified]
```
**Steps:** 1) Position with TP+SL exits. 2) Force TP to fill.
**Expected Results:** Sibling SL cancelled (OCO); exactly one exit executes (no double-close); trader notified (notify precedes cancel so a cancel failure can't suppress it).

---
```yaml
id: TC-COPY-004-003
title: Copied percent bracket re-anchors to the subscriber's own fill price
primary_func_id: COPY-004
related_func_ids: [COPY-001, RISK-003]
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
automation_ref: automation/integration/test_tc_copy_004_003_reanchor_bracket.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, copy-engine, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/bracket_emulator.py::emulate_bracket_exits / _reanchor_exit_price]
evidence_requirements: [Subscriber TP/SL absolute prices computed from subscriber filled_avg_price, ≥1 tick off anchor]
```
**Preconditions:** Subscriber has `copy_trader_bracket=true`; subscriber fill price differs from trader's.
**Steps:** 1) Trader entry with percent TP/SL fans out and the subscriber fills. 2) Inspect the subscriber's exit prices.
**Expected Results:** Exit prices re-anchored to the subscriber's own fill (not the trader's), tick-rounded and ≥1 tick off the anchor.
```
