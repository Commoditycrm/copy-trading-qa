# SnapTrade broker integration (Stage 3)

Primary **BRK-002** (hosted connect), **BRK-003** (webhook), **JOB-003** (SnapTrade poll listener).
Source: `backend/app/api/brokers.py` (`snaptrade_start`, `snaptrade_finish`, `snaptrade_webhook`,
`_ensure_snaptrade_configured`, `_register_or_reset_snaptrade_user`, `_evict_existing_brokers`),
`backend/app/brokers/snaptrade.py`, `backend/app/services/snaptrade_listener.py`,
`backend/app/services/crypto.py`, `backend/app/config.py` (`SNAPTRADE_*`).

**Environment:** `[local-qa]` with a **mocked SnapTrade adapter layer** (fixtures) or a QA SnapTrade
**sandbox**; connecting a real upstream brokerage is **prohibited** (real-money). Cases needing a live
SnapTrade sandbox that is not provisioned are marked **Blocked**. `@destructive` where they write accounts.
**Never production.**

---
```yaml
id: TC-BRK-002-001
title: Start hosted connection flow returns a portal URL and creates a Redis session (TTL 30m)
primary_func_id: BRK-002
related_func_ids: []
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
automation_ref: automation/integration/test_tc_brk_002_001_snaptrade_start.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, destructive, P1]
source_refs: [POST /api/brokers/snaptrade/start, backend/app/api/brokers.py::snaptrade_start, brokers/snaptrade.py::register_user/make_login_url]
evidence_requirements: [200 StartSnaptradeOut(portal_url); Redis key snaptrade:connect:{user_id} set with ~30m TTL; connection_type=trade]
```
**Preconditions:** `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` configured (QA sandbox) or mocked.
**Steps:** 1) POST snaptrade/start. 2) Inspect Redis session key + TTL.
**Expected Results:** 200 with portal URL; Redis session created (user_secret/label/paper/slug), TTL ≈ 30m; `make_login_url` defaults `connection_type=trade`. If creds blank → 503 (see TC-BRK-002-009).

---
```yaml
id: TC-BRK-002-002
title: Redis connect session expires and finish without a session is rejected (400 no_snaptrade_session)
primary_func_id: BRK-002
related_func_ids: []
module: brokers
test_level: L3
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_002_002_session_expiry.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, negative, P1]
source_refs: [backend/app/api/brokers.py::snaptrade_finish (no Redis session → 400 no_snaptrade_session)]
evidence_requirements: [Expired/absent session → finish returns 400 no_snaptrade_session]
```
**Steps:** 1) Delete/expire the Redis session. 2) POST snaptrade/finish.
**Expected Results:** 400 `no_snaptrade_session`; no account created.

---
```yaml
id: TC-BRK-002-003
title: Finish hosted flow — persist account, verify, start listener (positive)
primary_func_id: BRK-002
related_func_ids: [JOB-003]
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
automation_ref: automation/integration/test_tc_brk_002_003_snaptrade_finish.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, destructive, P1]
source_refs: [POST /api/brokers/snaptrade/finish, backend/app/api/brokers.py::snaptrade_finish, brokers/snaptrade.py::list_authorizations/list_accounts/verify_connection]
evidence_requirements: [201 BrokerAccountOut; encrypted creds (incl. user_secret); audit broker.connected; SnapTrade listener start requested]
```
**Preconditions:** Valid Redis session; mocked/sandbox SnapTrade returning a trade-capable account.
**Steps:** 1) POST snaptrade/finish.
**Expected Results:** 201; account persisted with encrypted creds; `audit broker.connected`; listener start requested. **NOTE (baseline §finish):** finish starts the listener **without** the `run_background_workers` guard — a duplicate-listener risk on the web tier; capture whether a duplicate listener appears and cross-ref JOB-006. Do not classify as Confirmed without reproducing twice.

---
```yaml
id: TC-BRK-002-004
title: Advisory lock + duplicate finish — concurrent/repeat finish yields exactly one account
primary_func_id: BRK-002
related_func_ids: [BRK-001]
module: brokers
test_level: L3
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_002_004_finish_advisory_lock.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, concurrency, destructive, P0]
source_refs: [backend/app/api/brokers.py::snaptrade_finish (pg_advisory_xact_lock per user; existing-row short-circuit)]
evidence_requirements: [Two concurrent/duplicate finish calls → ONE SnapTrade account; second returns the existing account (201), no duplicate]
```
**Steps:** 1) Fire two concurrent finish calls (React StrictMode double-fire simulation).
**Expected Results:** Advisory lock serializes; existing-row short-circuit returns the same account; exactly one account. Account-replacement/duplicate data integrity (P0).

---
```yaml
id: TC-BRK-002-005
title: Account selection — single, multiple, and none available
primary_func_id: BRK-002
related_func_ids: []
module: brokers
test_level: L3
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_002_005_account_selection.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, boundary, destructive, P1]
source_refs: [backend/app/api/brokers.py::snaptrade_finish (list_authorizations empty → 400 no_connection_found; list_accounts no match → 400 no_account_found)]
evidence_requirements: [Single account → connected; multiple → correct one selected; none → 400 no_connection_found / no_account_found]
```
**Steps (data-driven, mocked SnapTrade):** 1) One account. 2) Multiple accounts. 3) Zero authorizations / zero accounts.
**Expected Results:** Single/multiple → correct account persisted; none → 400 (`no_connection_found` / `no_account_found`).

---
```yaml
id: TC-BRK-002-006
title: Read-only SnapTrade connection is rejected for subscribers (400 snaptrade_read_only)
primary_func_id: BRK-002
related_func_ids: [AUTHZ-001]
module: brokers
test_level: L3
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_002_006_readonly_rejected.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, security, destructive, P0]
source_refs: [backend/app/api/brokers.py::snaptrade_finish (subscriber + non-trade auth type → 400 snaptrade_read_only, clears session)]
evidence_requirements: [Subscriber connecting a read-only (non-trade) SnapTrade authorization → 400 snaptrade_read_only; NO account persisted]
```
**Steps:** 1) Subscriber finishes with a read-only authorization.
**Expected Results:** 400 `snaptrade_read_only`; session cleared; no account. **A read-only connection must never be accepted for a subscriber** (P0 — mirrors would silently no-op).

---
```yaml
id: TC-BRK-002-007
title: Trade-capable connection accepted; trader and subscriber both connect a trade authorization
primary_func_id: BRK-002
related_func_ids: [JOB-003]
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
automation_ref: automation/integration/test_tc_brk_002_007_trade_capable.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, destructive, P1]
source_refs: [backend/app/api/brokers.py::snaptrade_finish (trade auth accepted)]
evidence_requirements: [Trade-capable auth → connected for both roles; trader gets a listener; subscriber does not get a trader listener]
```
**Steps:** 1) Trader finishes trade auth → listener. 2) Subscriber finishes trade auth → connected, no trader listener.
**Expected Results:** Both connect; listener behavior is role-appropriate.

---
```yaml
id: TC-BRK-002-008
title: Hosted redirect completion (?snaptrade_connected=1) drives finish in the frontend
primary_func_id: BRK-002
related_func_ids: []
module: brokers
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
owner: unassigned
status: Blocked
last_reviewed: 2026-07-30
tags: [ui, brokers, snaptrade, blocked, P2]
source_refs: [frontend/app/(app)/brokers/page.tsx (?snaptrade_connected=1, sessionStorage snaptrade:label, finishFiredRef guard)]
evidence_requirements: [Return URL with ?snaptrade_connected=1 triggers exactly one finish call (guard prevents double-fire)]
```
**BLOCKED:** requires the hosted SnapTrade portal round-trip (external redirect) — deferred to the UI suite with a SnapTrade sandbox. Documents the frontend completion path (`finishFiredRef` double-fire guard).
**Steps:** 1) (UI) Load brokers page with `?snaptrade_connected=1`.
**Expected Results:** Exactly one finish call fired; UI reflects the connected account. Marked Blocked pending sandbox.

---
```yaml
id: TC-BRK-002-009
title: SnapTrade not configured → endpoints return 503
primary_func_id: BRK-002
related_func_ids: []
module: brokers
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_002_009_not_configured.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, snaptrade, negative, P1]
source_refs: [backend/app/api/brokers.py::_ensure_snaptrade_configured (blank creds → 503), brokers/snaptrade.py::snaptrade_configured]
evidence_requirements: [With SNAPTRADE_CLIENT_ID/CONSUMER_KEY blank, start/finish return 503 (no crash)]
```
**Steps:** 1) Blank SnapTrade creds. 2) POST start/finish.
**Expected Results:** 503 (graceful) — dev/QA without SnapTrade creds is not broken.

---
```yaml
id: TC-BRK-002-010
title: Invalid SnapTrade user id / invalid authorization / verification failure map to 502/400
primary_func_id: BRK-002
related_func_ids: []
module: brokers
test_level: L3
test_type: Negative
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_002_010_snaptrade_failures.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, negative, destructive, P1]
source_refs: [backend/app/api/brokers.py::snaptrade_finish (401→502 snaptrade_auth_failed; list failures→502; verify fail→audit broker.connect_failed + 400 snaptrade_verify_failed)]
evidence_requirements: [Auth failure → 502 snaptrade_auth_failed; verify failure → 400 snaptrade_verify_failed + audit; no account persisted]
```
**Steps (data-driven, mocked):** invalid user id (401); invalid authorization list; verify_connection failure.
**Expected Results:** 502 / 400 as mapped; rollback; audit `broker.connect_failed` on verify failure.

---
```yaml
id: TC-BRK-002-011
title: SnapTrade timeout and rate limiting are surfaced (pagination not silently truncated)
primary_func_id: BRK-002
related_func_ids: [JOB-003]
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_002_011_snaptrade_timeout_ratelimit.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, recovery, destructive, P1]
source_refs: [backend/app/brokers/snaptrade.py (get_account_activities break-on-error → possible truncation; SNAPTRADE_SEM=4), baseline §4]
evidence_requirements: [Timeout/429 handled; note baseline: activities pagination breaks on error and can truncate P&L — verify + flag]
```
**Steps:** 1) Fake SnapTrade timeout/429 during finish/poll.
**Expected Results:** Errors handled without crash; **observe** whether activity pagination truncates on error (baseline §4). If truncation reproduced twice, raise as Potential.

---
```yaml
id: TC-BRK-002-012
title: SnapTrade account replacement (evict existing SnapTrade account)
primary_func_id: BRK-002
related_func_ids: [BRK-001]
module: brokers
test_level: L3
test_type: Data-Integrity
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_002_012_snaptrade_replace.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, data-integrity, destructive, P0]
source_refs: [backend/app/api/brokers.py::snaptrade_finish (_evict_existing_brokers; existing SnapTrade account returned without duplication)]
evidence_requirements: [Existing SnapTrade account → returned (no duplicate); connecting a different broker evicts it with orders preserved (SET NULL)]
```
**Steps:** 1) Finish twice for the same user. 2) Connect a different broker.
**Expected Results:** No duplicate SnapTrade account; replacement evicts with `broker.replaced` audit and order preservation (P0 — no data loss).

---
```yaml
id: TC-BRK-002-013
title: SnapTrade credential encryption + redaction (user_secret never exposed)
primary_func_id: BRK-002
related_func_ids: [SEC-001]
module: brokers
test_level: L3
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_002_013_snaptrade_cred_redaction.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, security, destructive, P0]
source_refs: [backend/app/brokers/snaptrade.py (snaptrade_user_secret Fernet-encrypted — grants trade placement), crypto.encrypt_json]
evidence_requirements: [snaptrade_user_secret stored encrypted; never in API responses/logs; evidence redacted]
```
**Steps:** 1) Finish. 2) Inspect DB + responses + logs.
**Expected Results:** `snaptrade_user_secret` (trade-granting) stored as Fernet ciphertext; never returned/logged. Credential-exposure guard (P0).

---
```yaml
id: TC-JOB-003-001
title: SnapTrade poll-listener cadence — 5s default, backs off to 60s when webhook enabled
primary_func_id: JOB-003
related_func_ids: [BRK-003]
module: brokers
test_level: L3
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_003_001_snaptrade_poll_cadence.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, listener, destructive, P1]
source_refs: [backend/app/services/snaptrade_listener.py (POLL_INTERVAL_S=5, 60s backstop when snaptrade_webhook_enabled), config.py]
evidence_requirements: [Webhook disabled → ~5s poll; webhook enabled → ~60s backstop poll]
```
**Steps:** 1) `snaptrade_webhook_enabled=false` → observe ~5s cadence. 2) `=true` → ~60s backstop.
**Expected Results:** Cadence matches the flag; listener detects trader orders and fans out (fake upstream).

---
```yaml
id: TC-JOB-003-002
title: Duplicate broker-order detection (SnapTrade dedup fingerprint + per-trader lock)
primary_func_id: JOB-003
related_func_ids: [COPY-001, TRADE-001]
module: brokers
test_level: L3
test_type: Concurrency
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_job_003_002_snaptrade_dedup.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, snaptrade, concurrency, destructive, P0]
source_refs: [backend/app/services/snaptrade_listener.py (_last_seen fingerprint, per-trader lock, newest-first lookup)]
evidence_requirements: [The same SnapTrade order seen by both the periodic poll and a webhook poll fans out ONCE (deduped by broker_order_id)]
```
**Steps:** 1) Trigger periodic poll + webhook poll for the same order.
**Expected Results:** Fanned out once; the in-memory fingerprint + per-trader lock prevent double-processing. Double-fanout guard (P0).
