# COPY-004 — Subscriber fill & close sync (SnapTrade / Webull)

Parent: **COPY-004**, workflows **WF-10/WF-11**. Source: `backend/app/services/snaptrade_listener.py`
(`_reconcile_one_subscriber_account`, `_relink_orphaned_mirror_ids`, `_persist_subscriber_fill`),
`backend/app/services/fills_sync.py` (`_refresh_open_orders`), `backend/app/services/copy_engine.py`
(`_place_mirror_with_conflict_resolve`, the close decision + `_DeferUntilEntryFills`),
`backend/app/services/order_retry.py` (`live_closeable_quantity`, `is_no_position_close_error`),
`backend/app/brokers/snaptrade.py` (`get_order`, `list_recent_activities`, `get_positions`).
App fixes under test: **PR #283** (mirror id-drift relink) and **PR #285** (no-position close retry).

**Root behaviour these cases pin down:** SnapTrade is inconsistent with itself — it returns one order id at
placement but lists the order under a different id in its feed (breaks fill matching → #283), and its
order-validation view lags its positions view (a close fired just after an entry fills is rejected "no matching
position" though the contract is held → #285). The broker executes correctly in all cases; these guard our app's
handling of that inconsistency.

**Environment:** deployed **QA** (`https://test.kopyya.com`) with a **real SnapTrade (Webull) subscriber** + a
connected **paper** broker holding a position. The disposable local **fake-broker** stack does NOT reproduce
SnapTrade's id drift or order-vs-positions lag, so these are **manual, `[qa]`** and `automation_candidate: false`.
All order-producing cases are `@destructive` — **paper account only, never a live-funded broker, never production.**

---
```yaml
id: TC-COPY-004-001
title: SnapTrade subscriber mirror entry that fills at the broker shows FILLED (not stuck Submitted)
primary_func_id: COPY-004
related_func_ids: [COPY-001]
module: copy-engine
test_level: L4
test_type: Integration
priority: P0
risk: Critical
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, fills, destructive, requires-real-broker, P0]
source_refs: [backend/app/services/snaptrade_listener.py::_reconcile_one_subscriber_account, PR #283]
evidence_requirements: [Mirror entry flips SUBMITTED -> FILLED within ~30s; Order History + realized P&L reflect the fill]
```
**Preconditions:** trader (broker) + 1 SnapTrade subscriber following, copy_enabled, connected paper broker.
**Steps:** 1) Trader places an order that fills. 2) Watch the subscriber's mirror order. 3) After ~30s check the subscriber's Order History and P&L.
**Expected Results:** the mirror flips from Submitted to **Filled** within a reconciler tick; the fill is recorded (Order History shows Filled, realized P&L counts it). It must not sit "Submitted" indefinitely.

---
```yaml
id: TC-COPY-004-002
title: A mirror whose broker-feed id differs from the placement id still syncs to FILLED (id-drift relink)
primary_func_id: COPY-004
related_func_ids: [COPY-004]
module: copy-engine
test_level: L4
test_type: Regression
priority: P0
risk: Critical
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, fills, id-drift, destructive, P0]
source_refs: [backend/app/services/snaptrade_listener.py::_relink_orphaned_mirror_ids, PR #283]
evidence_requirements: [Order stored with placement id absent from feed still flips to FILLED after the relink adopts the feed id]
```
**Preconditions:** SnapTrade subscriber whose broker assigns a feed order id different from the placement id (Webull-via-SnapTrade).
**Steps:** 1) Trader fills an order → subscriber mirror placed. 2) Confirm (DB) the mirror's broker_order_id is NOT in the account's SnapTrade order feed. 3) Wait for the reconciler.
**Expected Results:** the reconciler adopts the feed's id (single unambiguous contract+side match) and the mirror flips to **Filled** — it does not stay stuck. Pre-#283 this order would remain Submitted forever.

---
```yaml
id: TC-COPY-004-003
title: Re-link is unambiguous only — no phantom/duplicate order and no mis-linked fill
primary_func_id: COPY-004
related_func_ids: [COPY-004]
module: copy-engine
test_level: L4
test_type: Security
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
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, id-drift, safety, P1]
source_refs: [backend/app/services/snaptrade_listener.py::_relink_orphaned_mirror_ids, PR #283]
evidence_requirements: [Two stuck orders on the SAME contract+side are NOT relinked (ambiguous); one each IS relinked]
```
**Steps:** 1) Create two stuck mirrors for the same contract+side, then one for a distinct contract. 2) Run the reconciler.
**Expected Results:** the distinct single-candidate order relinks and fills; the ambiguous pair is left untouched (never guesses which fill belongs to which). A fill is never attached to the wrong order.

---
```yaml
id: TC-COPY-004-004
title: Subscriber Positions tab matches the broker even while the order display lags
primary_func_id: COPY-004
related_func_ids: [POS-001]
module: copy-engine
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
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, positions, P2]
source_refs: [backend/app/api/positions.py::list_positions]
evidence_requirements: [Positions tab (live broker) shows the held contract even while Order History still shows Submitted]
```
**Steps:** 1) With a mirror still showing Submitted (pre-sync), open the subscriber's Positions tab.
**Expected Results:** the Positions tab (which reads the broker live) shows the held contract correctly, even though the order display lags. The two are sourced differently — Positions must stay accurate.

---
```yaml
id: TC-COPY-004-005
title: Trader closes → SnapTrade subscriber's close completes (broker flat AND shown closed in Kopyya)
primary_func_id: COPY-004
related_func_ids: [COPY-002]
module: copy-engine
test_level: L4
test_type: Integration
priority: P0
risk: Critical
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, close, destructive, P0]
source_refs: [backend/app/services/copy_engine.py::_place_mirror_with_conflict_resolve, PR #285]
evidence_requirements: [After the trader closes, the subscriber is flat at the broker and the mirror close shows Filled]
```
**Preconditions:** SnapTrade subscriber holding a mirrored position the trader also holds.
**Steps:** 1) Trader closes the position. 2) Watch the subscriber's close.
**Expected Results:** the subscriber's close is placed and **fills**; the broker shows them flat and Kopyya shows the close Filled. No manual close required.

---
```yaml
id: TC-COPY-004-006
title: Close rejected "no matching position" right after an entry fills is retried and completes
primary_func_id: COPY-004
related_func_ids: [COPY-004]
module: copy-engine
test_level: L4
test_type: Regression
priority: P0
risk: Critical
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, close, no-position-retry, destructive, P0]
source_refs: [backend/app/services/order_retry.py::is_no_position_close_error, PR #285]
evidence_requirements: [First close attempt REJECTED 'no matching position', a retry (positions confirm held) then FILLS — no manual sell]
```
**Preconditions:** SnapTrade subscriber; trader closes **immediately after** the subscriber's entry fills (so SnapTrade's order view lags its positions view).
**Steps:** 1) Trader opens then quickly closes. 2) Observe the subscriber's close order attempts.
**Expected Results:** if SnapTrade first rejects the close "no matching position," the app **re-confirms the live holding and retries** after a short wait; the retry **fills**. The subscriber ends flat with no manual intervention. Pre-#285 the close went straight to REJECTED and stranded them long (prod AAPL $337.5, Sep 2026).

---
```yaml
id: TC-COPY-004-007
title: A genuinely flat subscriber is never retried into a naked short (no-position guard)
primary_func_id: COPY-004
related_func_ids: [COPY-004]
module: copy-engine
test_level: L4
test_type: Security
priority: P0
risk: Critical
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, close, naked-short, safety, P0]
source_refs: [backend/app/services/order_retry.py::live_closeable_quantity, PR #285]
evidence_requirements: [Close on a truly flat account is NOT retried; rejected cleanly (position_already_flat); no short opened]
```
**Steps:** 1) Fire a close for a subscriber who holds nothing on the contract (broker confirms 0).
**Expected Results:** the "no position" retry does **not** engage (live held qty is 0) — the order is rejected cleanly (`position_already_flat`) and **no short is opened**. The retry only ever fires when the broker confirms a live holding (> 0).

---
```yaml
id: TC-COPY-004-008
title: Subscriber who never entered is not naked-shorted on the trader's close (RETO case)
primary_func_id: COPY-004
related_func_ids: [COPY-002]
module: copy-engine
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
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, close, naked-short, P1]
source_refs: [backend/app/services/copy_engine.py::_OpeningShortSkipped]
evidence_requirements: [Trader close fans out to a subscriber who never held the contract -> skipped/rejected, no short]
```
**Preconditions:** a subscriber whose ENTRY never filled (e.g. rejected for buying power), so they hold nothing.
**Steps:** 1) Trader closes the position. 2) Inspect the subscriber's mirror close.
**Expected Results:** the close is correctly skipped/rejected ("no matching position" / "can't be sold short") — the app **does not** open a short in a name they never held. Not treated as exposure.

---
```yaml
id: TC-COPY-004-009
title: Underfunded subscriber's entry rejection shows the REAL reason, not "credential issues"
primary_func_id: COPY-004
related_func_ids: [ADMIN-001]
module: copy-engine
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
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, reject-reason, admin, P2]
source_refs: [backend/app/services/order_retry.py::clean_broker_error, frontend admin fanout panel]
evidence_requirements: [Reject reason reads 'Insufficient buying power' in Order History AND the admin fanout summary]
```
**Preconditions:** a subscriber whose account can't fund the mirrored order.
**Steps:** 1) Trader places an order too large for the subscriber. 2) Read the reject reason in the subscriber's Order History and the admin fan-out summary.
**Expected Results:** both show the **actual** reason — "Insufficient buying power" — not a generic "credential issues." The admin summary should reflect the real per-subscriber reasons (or a breakdown), so triage isn't misdirected. Connected accounts must not be labelled a credentials problem.

---
```yaml
id: TC-COPY-004-010
title: Exposure reconciliation — no subscriber left holding a position the trader has closed
primary_func_id: COPY-004
related_func_ids: [COPY-002]
module: copy-engine
test_level: L4
test_type: Data-Integrity
priority: P0
risk: Critical
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-18
tags: [copy-engine, snaptrade, exposure, reconciliation, P0]
source_refs: [PR #283, PR #285]
evidence_requirements: [After a trader round-trip, every SnapTrade subscriber's broker positions match the trader's (none over-held)]
```
**Steps:** 1) Trader opens and later closes a position mirrored to SnapTrade subscribers. 2) After the close, compare each subscriber's LIVE broker positions to the trader's.
**Expected Results:** no subscriber still holds a contract the trader has exited (no stranded long). Any subscriber holding what the trader doesn't is a **real-money exposure** and a failure — the entry/close sync (#283 + #285) must keep them reconciled.
