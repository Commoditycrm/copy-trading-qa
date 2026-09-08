# SELL-ALL — Sell-All, Snapshot & Re-Entry (with PDC)

Manual test cases for the Sell-All / Snapshot / Re-Entry suite (admin-gated per trader). Imported from the
feature guide **Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf** (2026-09-07). Guide IDs are preserved as the last
segment of the ID (guide `TC-14` → `TC-SELL-001-14`).

**Feature:** Exit all positions (optionally as a trailing stop with Market/PDC/Exit basis) → a snapshot is
saved → re-enter any/all at market, a % below Market/PDC/Exit, or an exact limit. New Positions columns: PDC
(previous day close) and P&L %. The whole suite is **admin-gated per trader** (allow-list, off by default);
non-allowed traders don’t see it and its endpoints 403.

**Environment:** deployed **QA** (`https://test.kopyya.com`) or local dev, with a **trader that has a
connected Alpaca (paper) broker** + an **admin** account to flip the Sell-All access toggle. Needs live market
data (Current price / PDC from Alpaca) — test during/after US market hours. **Paper account only — never a
live-funded broker.** Trailing stops & PDC are **stock-only** (Alpaca); options fall back to market/limit.

**Automation:** manual for now — these need a real Alpaca-paper broker + live quotes, which the disposable
mock-broker stack does not provide. Automation candidates (no broker/market data needed): the access-gate
authZ checks (TC-SELL-004-30, -33) and the negative-input guard (TC-SELL-006-35).

**Endpoints (from the guide):** `POST /api/positions/close-all`, `POST /api/positions/re-enter`,
`GET /api/snapshots/latest`, admin traders Sell-All-access toggle + Hide-P&L.

## Functional areas

- **SELL-001** — Exit / Sell-All (incl. trailing stops)
- **SELL-002** — Snapshot (shared basket)
- **SELL-003** — Re-entry
- **SELL-004** — Access gate & admin
- **SELL-005** — Positions columns (PDC / P&L%)
- **SELL-006** — Safe numeric inputs

---

```yaml
id: TC-SELL-001-01
title: Exit all at market
primary_func_id: SELL-001
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/close-all, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-01]
evidence_requirements: [All positions close at market. A snapshot is created; the Re-Enter card appears and /snapshot lists every exited positio]
```
**Steps:** 1) Trail % empty. Click Exit My Positions → confirm.
**Expected Results:** All positions close at market. A snapshot is created; the Re-Enter card appears and /snapshot lists every exited position.

---

```yaml
id: TC-SELL-001-02
title: Trailing stop (Market basis)
primary_func_id: SELL-001
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/close-all, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-02]
evidence_requirements: [Stocks close as TRAILING_STOP 5% trail off the live price (Alpaca); options/unsupported fall back to market. Toast note]
```
**Steps:** 1) Trail % = 5, basis Market. Click Exit My Positions.
**Expected Results:** Stocks close as TRAILING_STOP, 5% trail off the live price (Alpaca); options/unsupported fall back to market. Toast notes how many were trailing stops.

---

```yaml
id: TC-SELL-001-03
title: Trailing stop (PDC basis)
primary_func_id: SELL-001
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/close-all, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-03]
evidence_requirements: [Stocks close with a FIXED dollar trail = 5% of each symbol’s PDC (trail_price) not a percent trail.]
```
**Steps:** 1) Trail % = 5, basis PDC. Click Exit My Positions.
**Expected Results:** Stocks close with a FIXED dollar trail = 5% of each symbol’s PDC (trail_price), not a percent trail.

---

```yaml
id: TC-SELL-001-04
title: Trailing order verified at the broker
primary_func_id: SELL-001
related_func_ids: []
module: sell-all
test_level: L4
test_type: Integration
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, broker, P1]
source_refs: [Alpaca paper, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-04]
evidence_requirements: [Order type is a trailing stop with the expected trail % / trail price; it is working not filled immediately.]
```
**Steps:** 1) After TC-SELL-001-02, open the position/order at Alpaca (or in Order History).
**Expected Results:** Order type is a trailing stop with the expected trail % / trail price; it is working, not filled immediately.

---

```yaml
id: TC-SELL-001-05
title: Options fall back to market/limit
primary_func_id: SELL-001
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, options, P1]
source_refs: [POST /api/positions/close-all, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-05]
evidence_requirements: [Options close as a market/limit order (no trailing stop no PDC). Stocks honor the trailing/PDC settings.]
```
**Steps:** 1) Exit All with a mix of stock + option positions.
**Expected Results:** Options close as a market/limit order (no trailing stop, no PDC). Stocks honor the trailing/PDC settings.

---

```yaml
id: TC-SELL-002-06
title: Default re-entry baked at exit
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/close-all, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-06]
evidence_requirements: [On /snapshot each row pre-fills to % below PDC = 3 without re-typing. Clearing the value = market.]
```
**Steps:** 1) Set Re-enter % = 3, basis PDC, then Exit My Positions.
**Expected Results:** On /snapshot each row pre-fills to % below PDC = 3 without re-typing. Clearing the value = market.

---

```yaml
id: TC-SELL-001-07
title: No-positions state disables exit
primary_func_id: SELL-001
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-07]
evidence_requirements: [Trail % / Re-enter % inputs are hidden and Exit My Positions is disabled.]
```
**Steps:** 1) With zero open positions, view the Bulk Exit bar.
**Expected Results:** Trail % / Re-enter % inputs are hidden and Exit My Positions is disabled.

---

```yaml
id: TC-SELL-005-08
title: PDC column on the Positions table
primary_func_id: SELL-005
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-08]
evidence_requirements: [Shows each stock’s previous day close; tooltip “Previous day’s market close price”. Options show “—”.]
```
**Steps:** 1) Open the Positions table; hover the PDC header.
**Expected Results:** Shows each stock’s previous day close; tooltip “Previous day’s market close price”. Options show “—”.

---

```yaml
id: TC-SELL-002-09
title: Snapshot page columns
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [GET /api/snapshots/latest, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-09]
evidence_requirements: [Columns: Symbol Side Qty Exit Price Current Price PDC Re-Entry Price Change/sh Status Re-Enter. Header shows co]
```
**Steps:** 1) Open /snapshot.
**Expected Results:** Columns: Symbol, Side, Qty, Exit Price, Current Price, PDC, Re-Entry Price, Change/sh, Status, Re-Enter. Header shows counts (e.g. 0/4 back in).

---

```yaml
id: TC-SELL-003-10
title: Re-Enter one at Market
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-10]
evidence_requirements: [A market BUY is placed; the row flips to Back in once filled (live no refresh).]
```
**Steps:** 1) On a pending row pick Market → Re-Enter.
**Expected Results:** A market BUY is placed; the row flips to Back in once filled (live, no refresh).

---

```yaml
id: TC-SELL-003-11
title: Re-Enter % below Market
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-11]
evidence_requirements: [Resting BUY LIMIT at live × 0.98 (matches the hint). Row shows Resting @ $….]
```
**Steps:** 1) Pick % below Market = 2; check the = $target hint; Re-Enter.
**Expected Results:** Resting BUY LIMIT at live × 0.98 (matches the hint). Row shows Resting @ $….

---

```yaml
id: TC-SELL-003-12
title: Re-Enter % below PDC
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-12]
evidence_requirements: [Resting BUY LIMIT at PDC × 0.98 (the PDC column value × 0.98).]
```
**Steps:** 1) Pick % below PDC = 2; Re-Enter.
**Expected Results:** Resting BUY LIMIT at PDC × 0.98 (the PDC column value × 0.98).

---

```yaml
id: TC-SELL-003-13
title: Re-Enter at an exact Limit $
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-13]
evidence_requirements: [Resting BUY LIMIT at exactly that price.]
```
**Steps:** 1) Pick Limit $, type an exact price; Re-Enter.
**Expected Results:** Resting BUY LIMIT at exactly that price.

---

```yaml
id: TC-SELL-003-14
title: Re-Enter All (% below PDC)
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-14]
evidence_requirements: [Every pending position gets a resting limit 2% below its PDC; resting/back-in rows are skipped.]
```
**Steps:** 1) In the Re-Enter All bar pick % below PDC = 2; Re-Enter All.
**Expected Results:** Every pending position gets a resting limit 2% below its PDC; resting/back-in rows are skipped.

---

```yaml
id: TC-SELL-003-15
title: Fill-aware Re-Enter All — no double-buy
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: Data-Integrity
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P0]
source_refs: [POST /api/positions/re-enter, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-15]
evidence_requirements: [Only pending rows act; the button shows the pending count and disables at 0. No double-buy of resting/back-in rows.]
```
**Steps:** 1) With some rows Resting or Back in, click Re-Enter All again.
**Expected Results:** Only pending rows act; the button shows the pending count and disables at 0. No double-buy of resting/back-in rows.

---

```yaml
id: TC-SELL-003-16
title: Re-Entry Price cell reflects resting then fill
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-16]
evidence_requirements: [Shows Resting @ $X while the limit works then the fill price once Back in.]
```
**Steps:** 1) Watch a re-entry go from placed → filled.
**Expected Results:** Shows Resting @ $X while the limit works, then the fill price once Back in.

---

```yaml
id: TC-SELL-003-17
title: Change/sh computed on a filled re-entry
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-17]
evidence_requirements: [Change/sh = exit − re-entry shown green (positive) / red (negative).]
```
**Steps:** 1) After a filled re-entry cheaper than the exit price.
**Expected Results:** Change/sh = exit − re-entry, shown green (positive) / red (negative).

---

```yaml
id: TC-SELL-003-18
title: Re-entry order tagged in Order History
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: Integration
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-18]
evidence_requirements: [The re-entry order is tagged as a Re-Entry (distinguishable from a normal / mirror order).]
```
**Steps:** 1) After any Re-Enter, open Order History.
**Expected Results:** The re-entry order is tagged as a Re-Entry (distinguishable from a normal / mirror order).

---

```yaml
id: TC-SELL-002-19
title: Individual close feeds the snapshot
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/close, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-19]
evidence_requirements: [That position is appended to the active snapshot and appears on /snapshot as pending.]
```
**Steps:** 1) From Positions, close a single position (market or limit).
**Expected Results:** That position is appended to the active snapshot and appears on /snapshot as pending.

---

```yaml
id: TC-SELL-002-20
title: Snapshot accumulates (deduped)
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: Data-Integrity
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [GET /api/snapshots/latest, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-20]
evidence_requirements: [It is added to the SAME active snapshot (deduped by symbol) rather than replacing it.]
```
**Steps:** 1) After an Exit All (some rows still pending), individually close another position.
**Expected Results:** It is added to the SAME active snapshot (deduped by symbol) rather than replacing it.

---

```yaml
id: TC-SELL-002-21
title: Live SSE update on fill
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: Integration
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, sse, P1]
source_refs: [SSE, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-21]
evidence_requirements: [Row flips Resting → Back in and Change/sh populates — without reloading (5s backstop poll if an event is missed).]
```
**Steps:** 1) Leave /snapshot open while a resting re-entry fills.
**Expected Results:** Row flips Resting → Back in and Change/sh populates — without reloading (5s backstop poll if an event is missed).

---

```yaml
id: TC-SELL-002-22
title: Default pre-fill Market vs PDC
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [POST /api/positions/close-all, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-22]
evidence_requirements: [The Snapshot row’s dropdown pre-selects % below Market vs % below PDC accordingly.]
```
**Steps:** 1) Exit once with Re-enter % basis Market, once with basis PDC.
**Expected Results:** The Snapshot row’s dropdown pre-selects % below Market vs % below PDC accordingly.

---

```yaml
id: TC-SELL-002-23
title: Staleness warning after 2+ days
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-23]
evidence_requirements: [A banner warns exit prices are stale and to prefer a market re-entry / a fresh snapshot.]
```
**Steps:** 1) Open /snapshot for a snapshot 2+ days old.
**Expected Results:** A banner warns exit prices are stale and to prefer a market re-entry / a fresh snapshot.

---

```yaml
id: TC-SELL-002-24
title: View snapshot link
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-24]
evidence_requirements: [Navigates to /snapshot showing the current active snapshot.]
```
**Steps:** 1) On the Positions Re-Enter card click View snapshot →.
**Expected Results:** Navigates to /snapshot showing the current active snapshot.

---

```yaml
id: TC-SELL-003-25
title: Re-Enter % below Exit (blank/0 and 5%)
primary_func_id: SELL-003
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-25]
evidence_requirements: [Blank/0 rests a BUY LIMIT at exactly the exit price; 5 rests at exit × 0.95 (matches the hint). Row shows Resting @ $….]
```
**Steps:** 1) On a pending row pick % below Exit. Leave % blank, check the = $ hint = exit price, Re-Enter. Then repeat with % = 5.
**Expected Results:** Blank/0 rests a BUY LIMIT at exactly the exit price; 5 rests at exit × 0.95 (matches the hint). Row shows Resting @ $….

---

```yaml
id: TC-SELL-005-26
title: Positions P&L % column
primary_func_id: SELL-005
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-26]
evidence_requirements: [Shows unrealized P&L as a % of cost basis green when up / red when down; sign matches the $ P&L.]
```
**Steps:** 1) Open the Positions table; view the P&L % column (next to Unrealized P&L).
**Expected Results:** Shows unrealized P&L as a % of cost basis, green when up / red when down; sign matches the $ P&L.

---

```yaml
id: TC-SELL-002-27
title: Snapshot % column
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: UI E2E
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-27]
evidence_requirements: [Shows the current price vs the exit price as a % (green = above exit red = below). “—” if no current price.]
```
**Steps:** 1) Open /snapshot; view the % column.
**Expected Results:** Shows the current price vs the exit price as a % (green = above exit, red = below). “—” if no current price.

---

```yaml
id: TC-SELL-004-28
title: Access gate — admin toggle
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Permission
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, admin, ui, P1]
source_refs: [PATCH admin traders sell-all-access, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-28]
evidence_requirements: [Flips grey OFF ↔ green ON instantly (toast fires); clicking the row itself still opens the trader detail the switch doe]
```
**Steps:** 1) As an admin, open Admin → Traders; click a trader’s Sell-All switch.
**Expected Results:** Flips grey OFF ↔ green ON instantly (toast fires); clicking the row itself still opens the trader detail, the switch does not.

---

```yaml
id: TC-SELL-004-28B
title: Access toggle persists after refresh
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Permission
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, admin, P1]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-28B]
evidence_requirements: [The switch is still ON (reads the saved value not defaulting to OFF).]
```
**Steps:** 1) Set a trader ON, then reload the Traders page.
**Expected Results:** The switch is still ON (reads the saved value, not defaulting to OFF).

---

```yaml
id: TC-SELL-004-28C
title: Access toggle live update (no refresh)
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Integration
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, admin, sse, P1]
source_refs: [SSE, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-28C]
evidence_requirements: [The trader’s Bulk Exit / Snapshot nav appears then disappears live without them refreshing (SSE).]
```
**Steps:** 1) Keep that trader logged in elsewhere. From the admin, flip their Sell-All ON, then OFF.
**Expected Results:** The trader’s Bulk Exit / Snapshot nav appears then disappears live, without them refreshing (SSE).

---

```yaml
id: TC-SELL-004-28D
title: Hide P&L + Hidden badge
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Permission
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, admin, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-28D]
evidence_requirements: [The row shows a persistent amber Hidden badge; the modal’s Unhide all clears it and the badge disappears.]
```
**Steps:** 1) On Admin → Traders click Hide P&L, pick an end date, Hide. Then reload.
**Expected Results:** The row shows a persistent amber Hidden badge; the modal’s Unhide all clears it and the badge disappears.

---

```yaml
id: TC-SELL-004-29
title: Non-allowed trader — suite hidden
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Permission
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, security, ui, P1]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-29]
evidence_requirements: [No Exit My Positions chip no Trail%/Re-enter% inputs no Re-Enter card; the Snapshot nav link is absent.]
```
**Steps:** 1) Log in as a trader whose Sell-All is Off. View Positions/Trade Panel + the nav.
**Expected Results:** No Exit My Positions chip, no Trail%/Re-enter% inputs, no Re-Enter card; the Snapshot nav link is absent.

---

```yaml
id: TC-SELL-004-30
title: Non-allowed trader — API blocked (403)
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: 'automation/api/tests/sell-all/sell-all-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, security, api, P0]
source_refs: [POST /api/positions/close-all, POST /api/positions/re-enter, GET /api/snapshots/latest, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-30]
evidence_requirements: [Returns 403 with detail sell_all_access_required — cannot be bypassed via API. UI toast: “You don’t have access to the S]
```
**Steps:** 1) As that Off trader, call POST /api/positions/close-all (or /re-enter, /snapshots/latest) directly.
**Expected Results:** Returns 403 with detail sell_all_access_required — cannot be bypassed via API. UI toast: “You don’t have access to the Sell-All tools yet. Please contact your admin to enable it.”

---

```yaml
id: TC-SELL-004-31
title: Allowed trader — full access
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Permission
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, api, P1]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-31]
evidence_requirements: [The whole suite appears (Exit My Positions snapshot re-entry) and all its endpoints work (200).]
```
**Steps:** 1) Admin sets that trader Sell-All: On; the trader reloads.
**Expected Results:** The whole suite appears (Exit My Positions, snapshot, re-entry) and all its endpoints work (200).

---

```yaml
id: TC-SELL-004-32
title: Direct /snapshot navigation when Off
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Permission
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P2]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-32]
evidence_requirements: [Shows “not enabled for your account — ask an admin” not the table.]
```
**Steps:** 1) As an Off trader, navigate straight to /snapshot.
**Expected Results:** Shows “not enabled for your account — ask an admin”, not the table.

---

```yaml
id: TC-SELL-004-33
title: Subscriber never eligible (trader-only)
primary_func_id: SELL-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: 'automation/api/tests/sell-all/sell-all-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, security, api, P0]
source_refs: [POST /api/positions/close-all, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-33]
evidence_requirements: [Suite never shown; endpoints 403 with trader_only (the gate is trader-only regardless of the flag).]
```
**Steps:** 1) As a subscriber, check the UI and call the sell-all endpoints.
**Expected Results:** Suite never shown; endpoints 403 with trader_only (the gate is trader-only regardless of the flag).

---

```yaml
id: TC-SELL-002-34
title: Same symbol twice — independent re-entry
primary_func_id: SELL-002
related_func_ids: []
module: sell-all
test_level: L4
test_type: Data-Integrity
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-34]
evidence_requirements: [Each row re-enters with its own setting against its own position — the first row’s value does not leak onto the second ]
```
**Steps:** 1) Have a snapshot with the same symbol on two rows (two separate MSFT exits at different exit prices). Set a different re-entry per row (e.g. % below Exit = 2 on one, Limit $ on the other), and Re-Enter each row.
**Expected Results:** Each row re-enters with its own setting against its own position — the first row’s value does not leak onto the second, and clicking Re-Enter on one does not fill the other. Status flips only on the row you clicked.

---

```yaml
id: TC-SELL-006-35
title: Negative % is blocked in all number fields
primary_func_id: SELL-006
related_func_ids: []
module: sell-all
test_level: L4
test_type: Boundary
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: 'automation/ui/tests/safe-inputs.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-08
tags: [sell-all, security, ui, P1]
source_refs: [Kopyya_SellAll_Snapshot_PDC_Test_Guide.pdf TC-35]
evidence_requirements: [The minus never appears and a pasted ‘-’ is stripped so the field cannot go negative. A valid positive number you type ]
```
**Steps:** 1) In any percentage field (re-entry %, Trail %, Re-enter %, TP/SL %, a risk limit in Settings) press the minus key, and try pasting a value like -5.
**Expected Results:** The minus never appears and a pasted ‘-’ is stripped, so the field cannot go negative. A valid positive number you type (e.g. 900) is left unchanged — never silently clamped.

---
