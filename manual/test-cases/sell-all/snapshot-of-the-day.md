# SELL-ALL — Snapshot of the Day (stacked multi-block view)

Manual test cases for the "Snapshot of the Day" change on the Sell-All feature. Imported from the feature guide
**Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf** (2026-09-11, branch `feature/sell-all-access-gate`). Guide IDs
are preserved as the last segment of the ID (guide `DS-01` → `TC-SNAP-001-01`).

**What changed:** `/snapshot` used to show only the single newest snapshot, so a fresh Exit hid the earlier one.
It now shows **every snapshot taken today** (US/Eastern trading day), stacked newest-first, each as its own
self-contained block with its own Taken time, Re-Enter All bar, and per-row Re-Enter / ✕. History is untouched:
each snapshot is still its own record, `/snapshot/history` still lists all of them, and opening one by link
(`?id=…`) still shows just that one.

**New endpoint:** `GET /api/positions/snapshots/today` — all of today's ET snapshots, fully priced (same shape
as `/snapshots/latest`). Still behind `require_sell_all_access`.

**Environment:** deployed **QA** (`https://test.kopyya.com`) or local dev, once this round is deployed. Needs a
**trader (or subscriber) with Snapshot access On and a connected Alpaca (paper) broker holding 2–3 positions**.
"Today" is the US/Eastern trading day — test during/after market hours so Current price populates. **Paper
account only — never a live-funded broker.**

**Automation:** DS-01…DS-13 stay manual — they need a real Alpaca-paper broker, live quotes, SSE and actual
exits/re-entries, which the disposable mock-broker stack does not provide. **TC-SNAP-006-14** (access-gate authZ
on `GET /api/positions/snapshots/today`, no broker / market data needed) is **Automated** in
`automation/api/tests/sell-all/sell-all-access.spec.ts` — the endpoint rides the shared `require_sell_all_access`
gate, so both gate tests (non-allow-listed trader and subscriber) assert it returns 403 `sell_all_access_required`.

## Functional areas

- **SNAP-001** — Stacked "today" view (what shows, ordering, scoping, empty state)
- **SNAP-002** — Live updates (SSE: new block / live fill)
- **SNAP-003** — Per-block actions & independence (Re-Enter / Re-Enter All / ✕)
- **SNAP-004** — History integrity & single-snapshot view
- **SNAP-005** — Pricing regression
- **SNAP-006** — Access gate

---

```yaml
id: TC-SNAP-001-01
title: Two exits both stay visible
primary_func_id: SNAP-001
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P1]
source_refs: [GET /api/positions/snapshots/today, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-01]
evidence_requirements: [Screenshot of two stacked snapshot blocks on /snapshot, the earlier one not hidden]
```
**Steps:** 1) Exit some positions (Exit My Positions). 2) Buy a couple more, then Exit again. 3) Open /snapshot.
**Expected Results:** BOTH snapshots show, stacked as separate blocks. The first one is not hidden or replaced by the second.

---

```yaml
id: TC-SNAP-001-02
title: Newest first
primary_func_id: SNAP-001
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P2]
source_refs: [GET /api/positions/snapshots/today, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-02]
evidence_requirements: [Screenshot showing block order and each header "Taken HH:MM · N orders"]
```
**Steps:** 1) With 2+ snapshots taken today, look at the order of the blocks.
**Expected Results:** The most recent snapshot is at the top; older ones follow below. Each block header shows its own "Taken HH:MM · N orders".

---

```yaml
id: TC-SNAP-002-03
title: New exit appears live
primary_func_id: SNAP-002
related_func_ids: [SNAP-001]
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, sse, ui, P1]
source_refs: [GET /api/positions/snapshots/today, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-03]
evidence_requirements: [New block appears at the top with no manual refresh; existing blocks unchanged]
```
**Steps:** 1) Leave /snapshot open. 2) From the Trade Panel, do another Exit My Positions.
**Expected Results:** A new block appears at the top without a manual refresh (SSE); existing blocks stay put.

---

```yaml
id: TC-SNAP-003-04
title: Blocks are independent (Re-Enter one)
primary_func_id: SNAP-003
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-04]
evidence_requirements: [Only the acted block's row changes (Resting/Back in); other blocks untouched]
```
**Steps:** 1) In the top block, Re-Enter one order. 2) Watch the other block(s).
**Expected Results:** Only that block's row changes (Resting/Back in). Other blocks are untouched — no cross-talk.

---

```yaml
id: TC-SNAP-003-05
title: Re-Enter All is per block
primary_func_id: SNAP-003
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-05]
evidence_requirements: [Only the clicked block's pending rows re-enter; other blocks' pending counts unchanged]
```
**Steps:** 1) Click Re-Enter All in one block.
**Expected Results:** Only that block's pending rows are re-entered; other blocks' pending counts don't change.

---

```yaml
id: TC-SNAP-003-06
title: Per-row ✕ delete
primary_func_id: SNAP-003
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P1]
source_refs: [Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-06]
evidence_requirements: [Only that row is removed from that block; other rows/blocks and any placed order untouched]
```
**Steps:** 1) Click ✕ on a row in one block; confirm.
**Expected Results:** Only that row is removed from that block. Other rows and all other blocks are unaffected; any order already placed is untouched.

---

```yaml
id: TC-SNAP-003-07
title: Deleting last row empties a block
primary_func_id: SNAP-003
related_func_ids: [SNAP-004]
module: sell-all
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P2]
source_refs: [Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-07]
evidence_requirements: [The emptied block disappears; other days'/blocks remain]
```
**Steps:** 1) ✕ every row of one block (or delete that snapshot from History).
**Expected Results:** That block disappears from the page. The other day's blocks remain.

---

```yaml
id: TC-SNAP-001-08
title: Only today shows
primary_func_id: SNAP-001
related_func_ids: [SNAP-004]
module: sell-all
test_level: L4
test_type: Functional
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P1]
source_refs: [GET /api/positions/snapshots/today, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-08]
evidence_requirements: [Only today's (ET) snapshots appear; a prior-day snapshot does not show on /snapshot]
```
**Steps:** 1) Ensure there's a snapshot from a previous day. 2) Open /snapshot.
**Expected Results:** Only today's snapshots appear. Yesterday's does not show here (it's still in History).

---

```yaml
id: TC-SNAP-004-09
title: History is unchanged
primary_func_id: SNAP-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P2]
source_refs: [Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-09]
evidence_requirements: [/snapshot/history lists every snapshot (today's + older) newest-first, nothing merged/renumbered]
```
**Steps:** 1) Open /snapshot/history.
**Expected Results:** Every snapshot is still listed (today's + older), newest-first, with the same Taken / Orders / Status. Nothing was merged, removed, or renumbered.

---

```yaml
id: TC-SNAP-004-10
title: Open one from history
primary_func_id: SNAP-004
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P2]
source_refs: [GET /api/positions/snapshots/latest, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-10]
evidence_requirements: [Single-snapshot view via ?id=…, "Back to today →" link, Re-Enter/delete work normally]
```
**Steps:** 1) On History, click a row (or open /snapshot?id=…).
**Expected Results:** The page shows just that one snapshot, with a "Back to today →" link. Re-Enter / delete work on it normally.

---

```yaml
id: TC-SNAP-001-11
title: Empty state (no exit today)
primary_func_id: SNAP-001
related_func_ids: []
module: sell-all
test_level: L4
test_type: Functional
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, ui, P2]
source_refs: [GET /api/positions/snapshots/today, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-11]
evidence_requirements: ["No snapshot taken today…" empty state with a Browse history link, not a broken/empty table]
```
**Steps:** 1) On a day with no exits yet, open /snapshot.
**Expected Results:** Shows "No snapshot taken today…" with a Browse history link — not a broken/empty table.

---

```yaml
id: TC-SNAP-002-12
title: Live fill within a block
primary_func_id: SNAP-002
related_func_ids: [SNAP-003]
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, sse, ui, P1]
source_refs: [POST /api/positions/re-enter, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-12]
evidence_requirements: [Row flips Resting → Back in and Change/sh populates live, no page reload]
```
**Steps:** 1) Rest a re-entry (e.g. % below Exit) in a block, then let it fill.
**Expected Results:** That row flips Resting → Back in and Change/sh populates, live, without reloading the page.

---

```yaml
id: TC-SNAP-005-13
title: Pricing regression check
primary_func_id: SNAP-005
related_func_ids: []
module: sell-all
test_level: L4
test_type: Regression
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, pricing, ui, P1]
source_refs: [GET /api/positions/snapshots/today, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-13]
evidence_requirements: [Current price, PDC, Expiry, % vs exit and option symbol labels all render in every block]
```
**Steps:** 1) Include a stock and an option in today's snapshots.
**Expected Results:** Current price, PDC, Expiry, % vs exit, and option symbol labels all still render correctly in every block (same as the single-snapshot view did).

---

```yaml
id: TC-SNAP-006-14
title: Access gate still holds (today endpoint)
primary_func_id: SNAP-006
related_func_ids: [SELL-004]
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
last_reviewed: 2026-09-16
tags: [sell-all, snapshot, security, api, P0]
source_refs: [GET /api/positions/snapshots/today, Kopyya_Snapshot_Of_The_Day_Test_Cases.pdf DS-14]
evidence_requirements: [UI shows "not enabled — ask an admin"; GET /api/positions/snapshots/today returns 403 sell_all_access_required]
```
**Steps:** 1) As a user whose Snapshot access is Off, open /snapshot and call GET /api/positions/snapshots/today directly.
**Expected Results:** UI shows the "not enabled — ask an admin" message; the endpoint returns 403 sell_all_access_required.
