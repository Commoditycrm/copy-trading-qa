# BRK-001 — Common broker-account behavior (Stage 1)

Parent: **BRK-001** (connect/list/refresh/settings/delete), **BRK-004** (listener-gating), **AUTHZ-001**
(ownership). Endpoints under `/api/brokers*`. Source: `backend/app/api/brokers.py` (`connect`,
`list_my_brokers`, `refresh_balance`, `update_broker_account_settings`, `delete_broker`,
`_evict_existing_brokers`, `_refresh_balance_into`), `backend/app/schemas/broker.py`,
`backend/app/models/broker_account.py`, `backend/app/services/crypto.py` (Fernet),
`backend/app/services/cache.py`, `backend/app/services/audit.py`, `backend/app/services/broker_filters.py`,
frontend `frontend/app/(app)/brokers/page.tsx`. Worker-notification / listener-control / Redis-fallback
points (Stage 1 #26–28) are authored in `job__listener-lifecycle.md` (JOB-005/006) and referenced here.

**Environment:** connect/disconnect/refresh cases `[local-qa]` **BROKER_MODE=fake** (`@destructive` — they
write account rows); read/validation cases may run `[local-qa, qa]`. **Never production.**

---
```yaml
id: TC-BRK-001-001
title: List the current user's broker accounts (newest first, own only)
primary_func_id: BRK-001
related_func_ids: [AUTHZ-001]
module: brokers
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-001-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, P2]
source_refs: [GET /api/brokers, backend/app/api/brokers.py::list_my_brokers, schemas/broker.py::BrokerAccountOut]
evidence_requirements: [200 list of own accounts newest-first; another user's accounts never present; response has NO secret fields]
```
**Steps:** 1) GET /api/brokers as a user with ≥1 account.
**Expected Results:** 200 `list[BrokerAccountOut]` (own only, newest-first); no `encrypted_credentials`/keys in the response.

---
```yaml
id: TC-BRK-001-002
title: Connect the first broker account (Alpaca fake) — persisted, encrypted, audited, cache invalidated
primary_func_id: BRK-001
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
automation_ref: automation/integration/test_tc_brk_001_002_connect_first.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, destructive, requires-fake-broker, P1, regression]
source_refs: [POST /api/brokers, backend/app/api/brokers.py::connect, crypto.encrypt_json, cache.invalidate_broker_accounts, audit]
evidence_requirements:
  - 201 BrokerAccountOut; DB BrokerAccount row (connection_status=connected)
  - encrypted_credentials is Fernet ciphertext (not plaintext); audit broker.connected; broker-accounts cache invalidated
```
**Preconditions:** User with no broker connected; fake broker creds.
**Steps:** 1) POST /api/brokers with a fake/alpaca-shaped payload.
**Expected Results:** 201; account persisted; credentials stored encrypted; `audit broker.connected`; cache busted.

---
```yaml
id: TC-BRK-001-003
title: One-broker-per-user — connecting a second broker evicts the first (replacement)
primary_func_id: BRK-001
related_func_ids: [JOB-002]
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
automation_ref: automation/integration/test_tc_brk_001_003_one_broker_per_user.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, data-integrity, destructive, requires-fake-broker, P0]
source_refs: [backend/app/api/brokers.py::_evict_existing_brokers (audit broker.replaced, listener stop)]
evidence_requirements:
  - After a second connect, exactly ONE broker account remains; prior account removed; audit broker.replaced
  - Existing ORDERS survive (broker_account_id SET NULL — no order data loss); prior listener stopped
```
**Preconditions:** User already has broker A connected (fake) with historical orders.
**Steps:** 1) Connect broker B.
**Expected Results:** A evicted, B remains (one-per-user); `audit broker.replaced`; **orders preserved** via SET NULL (no data loss); prior trader listener stopped. Account-replacement data-loss guard (P0).

---
```yaml
id: TC-BRK-001-004
title: Disconnect a broker account (204, audit, cache invalidation, listener stop)
primary_func_id: BRK-001
related_func_ids: [JOB-007]
module: brokers
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-001-004)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, destructive, requires-fake-broker, P1]
source_refs: [DELETE /api/brokers/{account_id}, backend/app/api/brokers.py::delete_broker]
evidence_requirements: [204; account row deleted; audit broker.deleted; cache invalidated; trader listener stopped (best-effort)]
```
**Steps:** 1) DELETE /api/brokers/{own account}.
**Expected Results:** 204; row removed; `audit broker.deleted`; cache busted; listener stop attempted.

---
```yaml
id: TC-BRK-001-005
title: Disconnect while open orders/positions exist — orders preserved (SET NULL), no cascade delete
primary_func_id: BRK-001
related_func_ids: [HIST-001]
module: brokers
test_level: L3
test_type: Data-Integrity
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_005_disconnect_with_orders.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, data-integrity, destructive, requires-fake-broker, P1]
source_refs: [backend/app/models/order.py (broker_account_id ON DELETE SET NULL), migration d9f4a82e617c]
evidence_requirements: [After disconnect, prior orders remain queryable with broker_account_id=NULL; order history intact]
```
**Preconditions:** Broker with historical + working orders.
**Steps:** 1) DELETE the broker. 2) GET /api/trades.
**Expected Results:** Orders survive (SET NULL); order history/performance audit trail preserved (no cascade delete of orders/fills).

---
```yaml
id: TC-BRK-001-006
title: Refresh broker balance (manual) updates cached balances and audits
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_006_refresh_balance.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, requires-fake-broker, P2]
source_refs: [POST /api/brokers/{id}/refresh-balance, backend/app/api/brokers.py::refresh_balance, _refresh_balance_into]
evidence_requirements: [200 BrokerAccountOut with updated balances; audit broker.balance_refreshed (auto=false)]
```
**Steps:** 1) POST refresh-balance (auto default false).
**Expected Results:** Cached cash/buying_power/total_equity updated; `audit broker.balance_refreshed`; on broker read error, `last_error` set (no raise).

---
```yaml
id: TC-BRK-001-007
title: Automatic balance refresh (?auto=1) suppresses the audit record
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L2
test_type: Functional
priority: P2
risk: Low
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_007_auto_refresh.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, requires-fake-broker, P2]
source_refs: [backend/app/api/brokers.py::refresh_balance (auto param suppresses audit)]
evidence_requirements: [?auto=1 → balances updated but NO broker.balance_refreshed audit noise]
```
**Steps:** 1) POST refresh-balance?auto=1.
**Expected Results:** Balances refreshed; no audit row (auto-poll suppresses audit). (UI 30s auto-poll + hidden-tab pause are covered by TC-BRK-001-020 / frontend note.)

---
```yaml
id: TC-BRK-004-001
title: Update listener-gating flags (auto_pull / bring_open / bring_filled) — persisted + audited
primary_func_id: BRK-004
related_func_ids: []
module: brokers
test_level: L2
test_type: Functional
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-004-001)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, P1]
source_refs: [PATCH /api/brokers/{id}/settings, backend/app/api/brokers.py::update_broker_account_settings, schemas/broker.py::BrokerAccountSettingsIn]
evidence_requirements: [Partial PATCH updates only provided flags; audit broker.settings_updated only when changed]
```
**Steps (data-driven):** 1) PATCH auto_pull_orders=false. 2) bring_open_orders=false. 3) bring_filled_orders=true. 4) empty PATCH (no change → no audit).
**Expected Results:** Provided flags persist; unchanged fields untouched; audit only on change.
> Sequence: TC-BRK-004-001 is the first BRK-004 case (BRK-001 sequence has a gap at 008 — permanent, not reused).

---
```yaml
id: TC-BRK-004-002
title: Listener-gating effect — auto_pull=false stops the trader's orders from being pulled/fanned out
primary_func_id: BRK-004
related_func_ids: [JOB-002, COPY-001]
module: brokers
test_level: L3
test_type: Integration
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_004_002_gating_effect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, destructive, requires-fake-broker, P1]
source_refs: [backend/app/services/broker_filters.py::auto_pull_enabled / should_persist_order]
evidence_requirements: [With auto_pull_orders=false, broker-observed orders are not persisted/fanned out; bring_open/bring_filled gate open vs filled]
```
**Steps:** 1) Trader auto_pull=false. 2) Broker-observed order arrives (fake listener).
**Expected Results:** Order not pulled/fanned out; toggling bring_open/bring_filled gates open vs filled order intake accordingly.

---
```yaml
id: TC-BRK-001-009
title: Invalid broker name rejected (422 unknown broker)
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-001-009)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, negative, P1]
source_refs: [backend/app/api/brokers.py::connect (_credentials_for → 422 for non-ALPACA/IBKR, incl. snaptrade/webull)]
evidence_requirements: [POST /api/brokers with broker=webull/snaptrade/unknown → 422 unknown broker]
```
**Steps (data-driven):** broker=webull → 422; broker=snaptrade → 422 (must use start/finish); broker=bogus → 422.
**Expected Results:** 422 `unknown broker`; only ALPACA/IBKR reach the generic connect path.

---
```yaml
id: TC-BRK-001-010
title: Missing required credential block for the chosen broker (422)
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L2
test_type: Negative
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-001-010)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, negative, P1]
source_refs: [backend/app/api/brokers.py::_credentials_for (ALPACA w/o alpaca block → 422; IBKR w/o ibkr block → 422)]
evidence_requirements: [Missing broker-specific block → 422; no account created]
```
**Steps:** 1) POST broker=alpaca with no `alpaca` block; broker=ibkr with no `ibkr` block.
**Expected Results:** 422 each; nothing persisted.

---
```yaml
id: TC-BRK-001-011
title: Malformed broker credentials — field-length validation rejects them (422)
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L2
test_type: Boundary
priority: P1
risk: Medium
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-001-011)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, boundary, negative, P1]
source_refs: [backend/app/schemas/broker.py::AlpacaCredentialsIn (api_key/secret 8–200), IbkrCredentialsIn field bounds]
evidence_requirements: [Too-short/too-long key/secret → 422 before any broker call]
```
**Steps:** 1) api_key 3 chars → 422; signing_key 5 chars (IBKR, min 20) → 422.
**Expected Results:** 422 field validation; no broker verification attempted.

---
```yaml
id: TC-BRK-001-012
title: Credential encryption at rest — stored blob is Fernet ciphertext, never plaintext
primary_func_id: BRK-001
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
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-001-012)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, security, destructive, requires-fake-broker, P0]
source_refs: [backend/app/services/crypto.py::encrypt_json (Fernet), backend/app/models/broker_account.py::encrypted_credentials]
evidence_requirements: [DB encrypted_credentials starts with Fernet token prefix (gAAAAA...); no api_key/secret substring present in plaintext]
```
**Steps:** 1) Connect a broker (fake). 2) Read the DB `encrypted_credentials` column.
**Expected Results:** Value is Fernet ciphertext (`gAAAAA…`); the raw key/secret does **not** appear anywhere in the column. Credential-encryption safety (P0).

---
```yaml
id: TC-BRK-001-013
title: Credential redaction — secrets never returned in API responses or written to logs
primary_func_id: BRK-001
related_func_ids: [SEC-001]
module: brokers
test_level: L2
test_type: Security
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-BRK-001-013)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, security, P0]
source_refs: [backend/app/schemas/broker.py::BrokerAccountOut (no secret fields), automation/common/redaction.ts]
evidence_requirements: [GET/POST broker responses contain no api_key/secret/encrypted_credentials; captured evidence is redacted]
```
**Steps:** 1) Connect + GET brokers. 2) Inspect responses and any captured logs/evidence.
**Expected Results:** No secret material in responses; evidence passes through redaction (Authorization/keys masked). Credential-exposure guard (P0).

---
```yaml
id: TC-BRK-001-014
title: Connection rollback when broker verification fails
primary_func_id: BRK-001
related_func_ids: []
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
automation_ref: automation/integration/test_tc_brk_001_014_verify_rollback.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, recovery, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/brokers.py::connect (verify_connection failure → audit broker.connect_failed, 400 broker_error)]
evidence_requirements: [On verification failure: NO connected account persisted; audit broker.connect_failed; 400 broker_error]
```
**Preconditions:** Fake broker set to fail `verify_connection`.
**Steps:** 1) POST /api/brokers.
**Expected Results:** 400 `broker_error`; `audit broker.connect_failed`; no usable account left behind (rollback).

---
```yaml
id: TC-BRK-001-015
title: Broker service timeout / 4xx / 5xx / network interruption during connect verification
primary_func_id: BRK-001
related_func_ids: []
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
automation_ref: automation/integration/test_tc_brk_001_015_connect_failures.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, recovery, negative, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/brokers.py::connect, brokers/*.verify_connection]
evidence_requirements: [Each failure mode surfaces a clean error (400/502), rolls back, and does not leave a half-connected account]
```
**Steps (data-driven, fake broker error profiles):** timeout; broker 429 (rate-limit); broker 4xx; broker 5xx; network drop mid-verify.
**Expected Results:** Each maps to a clean error (400/502) with rollback; no partial account; `last_error`/audit recorded where applicable.

---
```yaml
id: TC-BRK-001-016
title: Reconnect after disconnect, and reconnect with different credentials (replacement)
primary_func_id: BRK-001
related_func_ids: [JOB-002]
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
automation_ref: automation/integration/test_tc_brk_001_016_reconnect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/brokers.py::connect + _evict_existing_brokers]
evidence_requirements: [Reconnect creates a fresh account + restarts trader listener; different creds replace prior encrypted blob]
```
**Steps:** 1) Disconnect. 2) Reconnect (same creds) → listener restarts. 3) Connect again with DIFFERENT creds → replaces, new encrypted blob.
**Expected Results:** Reconnect works; different-credential reconnect replaces the old (one-per-user) with a new encrypted blob; listener re-established.

---
```yaml
id: TC-BRK-001-017
title: Concurrent duplicate connection requests do not create duplicate accounts
primary_func_id: BRK-001
related_func_ids: [BRK-002]
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
automation_ref: automation/integration/test_tc_brk_001_017_concurrent_connect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, concurrency, destructive, requires-fake-broker, P0]
source_refs: [backend/app/api/brokers.py::snaptrade_finish (pg_advisory_xact_lock; existing-row short-circuit); connect eviction path]
evidence_requirements: [Two near-simultaneous connect/finish calls → exactly ONE account (no duplicate/data race)]
```
**Steps:** 1) Fire two concurrent connect (and SnapTrade finish) requests for the same user.
**Expected Results:** Exactly one broker account results (advisory lock + existing-row short-circuit for SnapTrade); no duplicate rows / no replacement data loss. (P0 — account replacement data integrity.)

---
```yaml
id: TC-BRK-001-018
title: Trader vs subscriber vs admin connection behavior
primary_func_id: BRK-001
related_func_ids: [AUTHZ-001, JOB-002]
module: brokers
test_level: L3
test_type: Permission
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: true
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_brk_001_018_role_connect.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, permission, destructive, requires-fake-broker, P1]
source_refs: [backend/app/api/brokers.py::connect (listener start gated on role==TRADER AND run_background_workers)]
evidence_requirements: [Trader connect → listener start requested; subscriber connect → NO trader listener; admin has account model but no broker UI]
```
**Steps:** 1) Trader connects (fake) → listener start requested. 2) Subscriber connects → no trader listener. 3) Admin: any authenticated user may call connect but admins have no broker UI (document behavior).
**Expected Results:** Listener start is trader-only (and worker-only); subscriber/admin connect does not spawn a trader listener.

---
```yaml
id: TC-AUTHZ-001-017
title: Broker-account ownership — refresh/settings/delete on another user's account returns 404
primary_func_id: AUTHZ-001
related_func_ids: [BRK-001]
module: brokers
test_level: L2
test_type: Permission
priority: P0
risk: Critical
environment: [local-qa, qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Automated
automation_ref: automation/api/tests/brokers/broker-integrations.spec.ts (TC-AUTHZ-001-017)
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, authz, permission, security, P0]
source_refs: [backend/app/api/brokers.py (owner check → 404 on refresh-balance/settings/delete)]
evidence_requirements: [User B calling refresh/settings/delete on user A's account id → 404; no cross-user mutation]
```
> Uses primary AUTHZ-001; next-free AUTHZ-001 sequence is 017.
**Steps:** 1) User B calls POST refresh-balance / PATCH settings / DELETE on user A's account id.
**Expected Results:** 404 each; A's account untouched. Cross-user broker-access guard (P0).

---
```yaml
id: TC-BRK-001-020
title: Production safety — broker connect/disconnect/settings are blocked against production
primary_func_id: BRK-001
related_func_ids: [AUTHZ-001]
module: brokers
test_level: L2
test_type: Security
priority: P0
risk: Critical
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_020_prod_write_block.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, security, P0]
source_refs: [automation/common/safety.ts::assertRequestAllowed (prod write-block), docs/ENVIRONMENT_GUIDE.md]
evidence_requirements: [Any POST/PATCH/DELETE /api/brokers* targeting prod is refused by the SafeApi guard before dispatch]
```
**Steps:** 1) With env=prod, attempt a broker connect/disconnect/settings mutation via the harness.
**Expected Results:** The `SafeApi` guard throws `SafetyViolation` and the request is never sent to production. Real-money/account safety (P0). Frontend replacement-confirmation (Stage 1 #5) is a UI concern covered by a `@ui` case in a later UI pass (documented gap).
```
