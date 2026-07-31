# RISK-001 — Daily limits, copy state, auto-pause / resume

Parent: **RISK-001**, workflow **WF-09/WF-13**. Endpoints under `/api/settings/subscriber/*`
(`daily-loss-limit`, `daily-loss-limit-pct`, `daily-profit-limit`, `daily-profit-limit-pct`,
`max-account-pct`, `copy`, `reset`). Source: `backend/app/api/settings.py`,
`backend/app/models/settings.py::SubscriberSettings`, `backend/app/services/copy_engine.py`
(daily kill-switch + auto-resume sweep), `backend/app/services/pnl_poller.py`,
`backend/app/services/cache.py`, `audit`, `events`, `notifications`.

**Environment:** setting PATCH cases `[local-qa, qa]` (non-destructive); enforcement/integration cases
`[local-qa]` with **BROKER_MODE=fake** (`@destructive`). **Never production.**

---
```yaml
id: TC-RISK-001-001
title: Set daily loss limit percentage and persist (audit + cache invalidation)
primary_func_id: RISK-001
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Functional
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-001-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, subscriber, P1, regression]
source_refs:
  - PATCH /api/settings/subscriber/daily-loss-limit-pct
  - backend/app/api/settings.py::set_daily_loss_limit_pct
evidence_requirements: [200 SubscriberSettingsOut; DB daily_loss_limit_pct persisted; audit subscriber.daily_loss_limit_pct_changed]
```
**Preconditions:** Subscriber account.
**Steps:** 1) PATCH daily-loss-limit-pct = 5.
**Expected Results:** Persisted; audit written; cache busted if following a trader.

---
```yaml
id: TC-RISK-001-002
title: Daily loss/profit percentage validation boundaries
primary_func_id: RISK-001
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-001-002)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, boundary, negative, P1]
source_refs: [backend/app/schemas/settings.py (pct gt=0,le=100)]
evidence_requirements: [422 for out-of-range; 200 for valid boundary; null clears]
```
**Steps (data-driven, loss% and profit%):** 0 → 422; -1 → 422; 100.01 → 422; 0.01 → 200 (lower bound); 100 → 200 (upper bound); null → clears the limit.
**Expected Results:** As annotated; only 0<pct≤100 accepted.

---
```yaml
id: TC-RISK-001-003
title: Set and clear daily profit limit percentage
primary_func_id: RISK-001
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Functional
priority: P2
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/risk/test_tc_risk_001_003_profit_pct.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, P2]
source_refs: [PATCH /api/settings/subscriber/daily-profit-limit-pct]
evidence_requirements: [Set then clear (null); persisted + audited each time]
```
**Steps:** 1) Set profit% = 10. 2) Clear (null).
**Expected Results:** Both persisted + audited.

---
```yaml
id: TC-RISK-001-004
title: Deprecated USD daily loss/profit limits still enforced where set
primary_func_id: RISK-001
related_func_ids: []
module: risk-controls
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_risk_001_004_usd_daily_limits.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P1]
source_refs:
  - PATCH /api/settings/subscriber/daily-loss-limit (ge=0), daily-profit-limit
  - backend/app/services/copy_engine.py (USD kill-switch in fanout)
evidence_requirements: [Legacy USD limit set → fanout pauses copy when today's USD P&L crosses it]
```
**Steps:** 1) Set USD daily_loss_limit. 2) Drive fake P&L past it. 3) Trader fans out.
**Expected Results:** Copy auto-pauses on the USD threshold (legacy path still active); deprecated but functional.

---
```yaml
id: TC-RISK-001-005
title: Max account percentage per day — set, boundary, and enforcement
primary_func_id: RISK-001
related_func_ids: []
module: risk-controls
test_level: L3
test_type: Boundary
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-001-005)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, boundary, destructive, requires-fake-broker, P1]
source_refs:
  - PATCH /api/settings/subscriber/max-account-pct (gt=0,le=100)
  - backend/app/services/pnl_poller.py (max_account_pct_per_day cap)
evidence_requirements: [422 out of range; enforcement caps daily trading value at the set % of day-start balance]
```
**Steps:** 1) Set max-account-pct=25; boundaries (0,>100 → 422). 2) Exceed the daily trading-value cap via fanout.
**Expected Results:** Bounds enforced (0<pct≤100); poller caps daily trading value at the configured percentage.

---
```yaml
id: TC-RISK-001-006
title: Copy enable/disable toggle clears auto-pause and auto-liquidation markers on enable
primary_func_id: RISK-001
related_func_ids: [RISK-002]
module: risk-controls
test_level: L2
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-001-006)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, data-integrity, P1]
source_refs: [PATCH /api/settings/subscriber/copy, backend/app/api/settings.py::toggle_copy]
evidence_requirements: [Enabling copy clears pnl_auto_paused_at AND auto_liquidated_at; audit subscriber.copy_toggled]
```
**Steps:** 1) Subscriber paused/liquidated. 2) PATCH copy=true.
**Expected Results:** `copy_enabled=true`; `pnl_auto_paused_at` and `auto_liquidated_at` cleared; audited; cache busted.

---
```yaml
id: TC-RISK-001-007
title: Daily loss auto-pause trigger — copy disabled, marker stamped, audit, SSE, notification
primary_func_id: RISK-001
related_func_ids: [NOTIF-001]
module: risk-controls
test_level: L3
test_type: Integration
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-behavior.spec.ts (TC-RISK-001-007)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/copy_engine.py (daily kill-switch), pnl_poller.py]
evidence_requirements: [On loss ≥ limit: copy_enabled=false, pnl_auto_paused_at set, audit copy.auto_paused_loss, SSE copy.auto_paused, notification]
```
**Steps:** 1) Set daily loss limit. 2) Drive fake P&L past it. 3) Trigger fanout / poller tick.
**Expected Results:** Copy auto-paused; `pnl_auto_paused_at` stamped; `audit copy.auto_paused_*`; SSE + in-app notification. Subsequent orders for that subscriber are skipped.

---
```yaml
id: TC-RISK-001-008
title: Daily profit auto-pause trigger
primary_func_id: RISK-001
related_func_ids: []
module: risk-controls
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-behavior.spec.ts (TC-RISK-001-008)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (profit kill-switch)]
evidence_requirements: [On profit ≥ limit: copy paused + marker + audit + SSE]
```
**Steps:** 1) Set profit limit. 2) Drive P&L to the profit target. 3) Fan out.
**Expected Results:** Copy auto-paused on profit; same marker/audit/SSE behavior as loss.

---
```yaml
id: TC-RISK-001-009
title: Next-day auto-resume — a prior-UTC-day pause re-enables copy on the next fanout
primary_func_id: RISK-001
related_func_ids: []
module: risk-controls
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-behavior.spec.ts (TC-RISK-001-009)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, recovery, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/copy_engine.py (daily auto-resume sweep), pnl_poller.py]
evidence_requirements: [pnl_auto_paused_at on a prior UTC day → copy_enabled=true, marker cleared, subscriber fires this fanout]
```
**Preconditions:** `pnl_auto_paused_at` stamped with a prior UTC day (time-controlled).
**Steps:** 1) Trigger a fanout on the new UTC day.
**Expected Results:** Subscriber auto-resumed (`copy_enabled=true`, `pnl_auto_paused_at` cleared) and receives the mirror. (Auto-liquidation is NOT resumed — see RISK-002.)

---
```yaml
id: TC-RISK-001-010
title: Reset-to-defaults resets risk config but preserves following/copy/pause/liquidation
primary_func_id: RISK-001
related_func_ids: [RISK-002, RISK-003, RISK-004]
module: risk-controls
test_level: L2
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-001-010)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, data-integrity, P1]
source_refs: [POST /api/settings/subscriber/reset, backend/app/api/settings.py::reset_subscriber_settings]
evidence_requirements: [~18 risk cols reset to defaults; following_trader_id, copy_enabled, pnl_auto_paused_at, auto_liquidated_at UNCHANGED; audit subscriber.settings_reset]
```
**Steps:** 1) Set several risk fields. 2) POST reset.
**Expected Results:** Risk config reverts to model defaults; `following_trader_id`, `copy_enabled`, `pnl_auto_paused_at`, `auto_liquidated_at` are deliberately preserved; audited; cache busted.

---
```yaml
id: TC-RISK-001-011
title: Setting change invalidates the subscriber cache for the followed trader
primary_func_id: RISK-001
related_func_ids: [COPY-001]
module: risk-controls
test_level: L3
test_type: Data-Integrity
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/risk/risk-settings.spec.ts (TC-RISK-001-011)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, risk-controls, data-integrity, P2]
source_refs: [backend/app/services/cache.py::invalidate_subscribers_for_trader]
evidence_requirements: [After a PATCH, the next fanout reads the NEW value (cache busted), not a stale cached one]
```
**Steps:** 1) Follow a trader (populate cache). 2) PATCH a risk setting (e.g. multiplier via COPY-001, or a limit). 3) Trader fans out.
**Expected Results:** Fanout reflects the new setting immediately (subscriber cache invalidated on write). (Note: `max-per-contract` intentionally does NOT bust cache and is unenforced — see RISK-005.)

---
```yaml
id: TC-RISK-001-012
title: Concurrent settings updates do not corrupt state (last-write consistency)
primary_func_id: RISK-001
related_func_ids: []
module: risk-controls
test_level: L2
test_type: Concurrency
priority: P2
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/risk/test_tc_risk_001_012_concurrent_updates.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, risk-controls, concurrency, P2]
source_refs: [backend/app/api/settings.py (per-field PATCH handlers), backend/app/models/settings.py]
evidence_requirements: [Two concurrent PATCHes to different fields both persist; same-field PATCHes resolve to one consistent value; no partial/corrupt row]
```
**Steps:** 1) Fire concurrent PATCHes (different fields, then same field).
**Expected Results:** Different-field updates both persist; same-field updates converge to a single value; the settings row remains consistent (no lost unrelated fields).
```
