# PNL-006 — Short-ticker OCC option classification & realized-P&L multiplier

Parent: **PNL-006**. App fix `2f9fc46` / **PR #297**, migration head **b6f1d3a9c72e**. Source:
`backend/app/services/fills_sync.py` (`sync_account_fills` — classifies via the shared
`app.brokers.alpaca._looks_like_occ` / `_parse_occ` instead of a `len >= 18` gate),
`backend/app/services/pnl.py` (100× multiplier keyed off `Order.instrument_type == OPTION`),
`backend/alembic/versions/b6f1d3a9c72e_retag_occ_options_mistagged_stock.py` (repairs saved rows).

**Why:** Alpaca's activity feed returns the **unpadded** OCC symbol, so a 1–2 char root is only 16–17
chars (`T270115C00026000`=16, `VG260626C00010500`=17). The old `len >= 18` gate dropped these to STOCK,
losing the ×100 contract multiplier — realized P&L showed **100× too small** (0.32 instead of 32.0).
Formula: **option realized = (sell − buy) × qty × 100**; **stock realized = (sell − buy) × qty**.

**Environment:** `[local-qa]`, BROKER_MODE=fake. Realized-P&L cases seed matched BUY→SELL legs via
`mb.seedPnl(..., instrument_type:'option')` and read `/api/positions/today-realized`; the fills-sync
**activity feed** itself is not drivable by the fake broker, so the classifier is exercised directly via
the grey-box `mb.classifyOcc`, and the migration via `mb.occRetagProbe`. **Never production.**

Verified on QA (per the release): **314 mis-tagged rows → 0**.

## A — Realized P&L short-ticker option multiplier (core bug) — Automated
```yaml
id: TC-PNL-006-1A1
title: 1-letter ticker option realized applies x100 (T call, +$32.00)
primary_func_id: PNL-006
related_func_ids: [PNL-001]
module: pnl
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/pnl/realized-pnl-options.spec.ts (TC-PNL-006-1A1)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, pnl, options, P0]
source_refs: [backend/app/services/pnl.py]
evidence_requirements: ["buy 0.02 / sell 0.34 / qty 1 option → today-realized +$32.00 (not +$0.32)"]
```
**A1** Buy 1 `T` call @ 0.02, sell @ 0.34 → **+$32.00**.
**A2** (`TC-PNL-006-1A2`) 2-letter `VG` call, 1.00 → 1.50 → **+$50.00**.
**A3** (`TC-PNL-006-1A3`) multi-contract `MU` ×3, 2.00 → 2.10 → **+$30.00** (0.10 × 3 × 100).
**A4** (`TC-PNL-006-1A4`) loss: `NG` ×2, 0.50 → 0.40 → **−$20.00** (sign and ×100 both correct).
**A5** (`TC-PNL-006-1A5`) put: `AG` put, 1.20 → 0.90 → **−$30.00**, contract tagged PUT.
All five automated in `realized-pnl-options.spec.ts`.

## B — Regression (nothing else changes)
```yaml
id: TC-PNL-006-1B1
title: Long-ticker option (always worked) still computes x100
primary_func_id: PNL-006
related_func_ids: [PNL-001]
module: pnl
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/pnl/realized-pnl-options.spec.ts (TC-PNL-006-1B1)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, pnl, options, regression, P2]
source_refs: [backend/app/services/pnl.py]
evidence_requirements: ["AAPL option buy 1.00 sell 1.40 qty 1 → +$40.00"]
```
**B1** `AAPL` call 1.00 → 1.40, 1 contract → **+$40.00** — Automated.
**B2** *(Manual — different code path)* the SAME trade placed in-app via the **live websocket** feed (not
history) → +$40.00, unchanged. The live path never used the length gate; verify it did not regress.
**B3** (`TC-PNL-006-1B3`, Automated) plain stock: 10 `F` shares 12.00 → 12.50 → **+$5.00**, no ×100.
**B4** (`TC-PNL-006-2CLS`, Automated) preferred/dotted symbol `PNFP.PRB` stays STOCK — not mis-read as OCC.
**B5** (`TC-PNL-006-2CLS`, Automated) odd strike: `VG…C00010500` → strike **10.50**, expiry & right correct.
(B4/B5 asserted via the shared classifier in `occ-classification.spec.ts`.)

## C — Data migration (repair of existing rows) — b6f1d3a9c72e
```yaml
id: TC-PNL-006-3MIG
title: Retag repairs a mis-tagged short-ticker option and is idempotent
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
automation_status: Automated
automation_ref: automation/api/tests/pnl/occ-migration.spec.ts (TC-PNL-006-3MIG)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [data-integrity, pnl, migration, P1]
source_refs: [backend/alembic/versions/b6f1d3a9c72e_retag_occ_options_mistagged_stock.py]
evidence_requirements: ["alembic head b6f1d3a9c72e; seeded STOCK+OCC row → OPTION, root symbol, strike/expiry/right filled; 2nd pass 0 rows; 0 mis-tagged remain"]
```
**C1** deployed head = `b6f1d3a9c72e` — Automated. **C2** `SELECT count(*) FROM orders WHERE
instrument_type='STOCK' AND symbol ~ '^[A-Z.]{1,6}[0-9]{6}[CP][0-9]{8}$'` → **0** — Automated.
**C3** a retagged row: `instrument_type=OPTION`, `symbol=MU` (root, not the long code), expiry/strike/right
filled — Automated. **C5** re-run migration → **0 rows changed** (idempotent) — Automated.
**C4** *(Manual)* history self-corrects: open a trader who had a mis-tagged short-ticker option before the
release; the old $0.32-style row now shows the ×100 value (realized P&L is computed on the fly).

## D — FIFO pairing (why we retag, not just relabel)
```yaml
id: TC-PNL-006-1D2
title: A still-open option shows no realized P&L
primary_func_id: PNL-006
related_func_ids: [PNL-001]
module: pnl
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/pnl/realized-pnl-options.spec.ts (TC-PNL-006-1D2)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, pnl, options, P2]
source_refs: [backend/app/services/pnl.py]
evidence_requirements: ["a bought-not-sold option contributes no realized P&L today"]
```
**D2** short-ticker option bought, not yet sold → **no realized P&L** — Automated.
**D1** *(Manual — blocked: needs mixed-source legs)* one contract whose OPEN leg synced correctly
(OPTION, root) and CLOSE leg synced via the broken path (STOCK, long code): after the fix both key on the
same contract → they **pair** → one clean ×100 figure, no orphan lot, no doubled position.

## F — End-to-end sanity vs broker
```yaml
id: TC-PNL-006-1F2
title: Calendar day total reflects the option x100 value
primary_func_id: PNL-006
related_func_ids: [PNL-001]
module: pnl
test_level: L3
test_type: Integration
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/pnl/realized-pnl-options.spec.ts (TC-PNL-006-1F2)
owner: unassigned
status: Draft
last_reviewed: 2026-09-22
tags: [integration, pnl, options, calendar, P2]
source_refs: [backend/app/api/calendar.py]
evidence_requirements: ["a day with a corrected short-ticker option shows the x100 day total (32.0, not 0.32)"]
```
**F2** the Calendar day total for a day containing a corrected short-ticker option reflects the ×100
value — Automated. **F1** *(Manual — blocked: real broker)* pick one closed short-ticker option and
compare the app's realized to the broker's realized for that trade → match within rounding.

**Smoke (one line):** find any closed option on a 1–2 letter ticker (T, VG, MU, F, C, X…) and confirm its
order-history Realized P&L is a whole-dollar figure ≈ 100× the raw price difference — not a few cents.
