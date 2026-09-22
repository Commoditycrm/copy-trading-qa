# PNL-006 — Short-ticker OCC option classification in fills-sync

Parent: **PNL-006**. Source: `backend/app/services/fills_sync.py` (`sync_account_fills` — now classifies
via the shared `app.brokers.alpaca._looks_like_occ` / `_parse_occ` instead of a `len >= 18` gate),
`backend/alembic/versions/f1d3a9c72e_retag_occ_options_mistagged_stock.py` (retag of rows already
written). App fix `2f9fc46`.

**Why this matters:** Alpaca's activity feed returns the **unpadded** OCC symbol, so a 1–2 char ticker
root is only 16–17 chars (e.g. `T251219C00025000`=16, `MU260918C01000000`=17). The old heuristic gated
options on `len(symbol) >= 18`, so short-ticker options were dropped to **STOCK**, losing the 100×
option contract multiplier — realized P&L rendered **100× too small** (0.32 instead of 32.0).

**Environment:** `[local-qa]`. The end-to-end fills-sync path reads the Alpaca **activity feed**, which the
QA fake broker does not currently expose, so the full-pipeline cases are **Blocked (automation gap)** —
they are verified at the classifier + P&L-magnitude level and are prime candidates for a backend unit test.
**Never production.**

---
```yaml
id: TC-PNL-006-001
title: A short-ticker OCC symbol (16–17 chars) is classified OPTION, not STOCK
primary_func_id: PNL-006
related_func_ids: [FILL-001, PNL-001]
module: pnl
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Blocked
automation_ref: "classifier verified via app.brokers.alpaca._looks_like_occ/_parse_occ; full fills-sync path needs a fake activity feed"
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [functional, pnl, options, regression, requires-fake-broker, P1]
source_refs: [backend/app/services/fills_sync.py::sync_account_fills]
evidence_requirements: ["_looks_like_occ('T251219C00025000') is True", "_parse_occ → ('T', 2025-12-19, 25, CALL)", "Order/Fill.instrument_type = OPTION"]
```
**Preconditions:** an Alpaca activity feed returns a fill for a short-ticker option, e.g. `T251219C00025000`
(root `T`, 16 chars) or `MU260918C01000000` (root `MU`, 17 chars).
**Steps:** 1) Run fills-sync for the account. 2) Inspect the written order/fill row.
**Expected Results:** `instrument_type = OPTION`; display symbol = the root (`T` / `MU`); `option_expiry`,
`option_strike`, `option_right` parsed from the OCC (e.g. `MU260918C01000000` → 2026-09-18, strike 1000,
CALL). It is NOT written as STOCK. (Old behavior: STOCK, because 16–17 < 18.)

---
```yaml
id: TC-PNL-006-002
title: Realized P&L for a short-ticker option applies the 100x contract multiplier
primary_func_id: PNL-006
related_func_ids: [PNL-001]
module: pnl
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Blocked
automation_ref: "needs fills-sync activity feed + realized-P&L read; classifier proven"
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, pnl, options, P0]
source_refs: [backend/app/services/fills_sync.py::sync_account_fills]
evidence_requirements: ["realized P&L = (sell-buy) * qty * 100 for an option, e.g. +32.00 not +0.32"]
```
**Preconditions:** a matched BUY→SELL on a short-ticker option, e.g. buy `MU…C…` @ 0.30, sell @ 0.62, qty 1.
**Steps:** 1) Sync both fills. 2) Read realized P&L (calendar / today-realized).
**Expected Results:** realized P&L = `(0.62 - 0.30) * 1 * 100 = +32.00` (option multiplier applied), NOT
`+0.32`. A regression would show the 100×-too-small figure.

---
```yaml
id: TC-PNL-006-003
title: A normal-length OCC symbol (>=18 chars) is still classified OPTION
primary_func_id: PNL-006
related_func_ids: [FILL-001]
module: pnl
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Blocked
automation_ref: "classifier verified; regression guard for the parser swap"
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [functional, pnl, options, regression, P2]
source_refs: [backend/app/services/fills_sync.py::sync_account_fills]
evidence_requirements: ["_parse_occ('AAPL251219C00250000') → ('AAPL', 2025-12-19, 250, CALL)"]
```
**Preconditions:** a fill for a long-root option, e.g. `AAPL251219C00250000` (19 chars).
**Steps:** 1) Sync fills. 2) Inspect the row.
**Expected Results:** `instrument_type = OPTION`, root `AAPL`, expiry/strike/right parsed — the parser swap
did not regress the previously-working case.

---
```yaml
id: TC-PNL-006-004
title: A genuine stock symbol stays STOCK
primary_func_id: PNL-006
related_func_ids: [FILL-001]
module: pnl
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Blocked
automation_ref: "classifier verified: _looks_like_occ('AAPL')=False"
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [functional, pnl, regression, P2]
source_refs: [backend/app/services/fills_sync.py::sync_account_fills]
evidence_requirements: ["_looks_like_occ('AAPL') is False → InstrumentType.STOCK"]
```
**Preconditions:** a fill for a plain equity symbol (`AAPL`, `MSFT`, `T`).
**Steps:** 1) Sync fills. 2) Inspect the row.
**Expected Results:** `instrument_type = STOCK`, display symbol uppercased; no option fields. A bare ticker
must not be mistaken for OCC.

---
```yaml
id: TC-PNL-006-005
title: Migration retags rows already written as STOCK that are actually short-ticker options
primary_func_id: PNL-006
related_func_ids: [MIGRATION]
module: pnl
test_level: L2
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Blocked
automation_ref: "migration f1d3a9c72e — verify by seeding a mis-tagged row then upgrade head"
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [data-integrity, pnl, migration, P1]
source_refs: [backend/alembic/versions/f1d3a9c72e_retag_occ_options_mistagged_stock.py]
evidence_requirements: ["a STOCK-tagged order whose symbol/broker_symbol is a short-ticker OCC becomes OPTION after upgrade; running the migration twice is a no-op"]
```
**Preconditions:** an existing order/fill row mis-tagged `instrument_type = STOCK` whose symbol is a
short-ticker OCC (written before the fix).
**Steps:** 1) `alembic upgrade head` (applies `f1d3a9c72e`). 2) Re-read the row. 3) Run the migration a
second time.
**Expected Results:** the row is retagged `OPTION` (with option fields backfilled where derivable); genuine
stocks are untouched; the migration is idempotent (second run changes nothing).

---
```yaml
id: TC-PNL-006-006
title: A malformed OCC-looking string does not crash fills-sync (skips / stays STOCK)
primary_func_id: PNL-006
related_func_ids: [FILL-001]
module: pnl
test_level: L2
test_type: Negative
priority: P3
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Blocked
automation_ref: "classifier: _looks_like_occ true but _parse_occ raises → not an option"
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [negative, pnl, robustness, P3]
source_refs: [backend/app/services/fills_sync.py::sync_account_fills]
evidence_requirements: ["a symbol that looks OCC-shaped but has a bad date/strike does not raise; row is handled, not dropped with a 500"]
```
**Preconditions:** a fill whose symbol is OCC-shaped but unparseable (e.g. an impossible date).
**Steps:** 1) Sync fills.
**Expected Results:** no unhandled exception; the row is treated as non-option (STOCK) or safely skipped —
never a crash of the whole sync pass.
