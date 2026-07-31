# Interactive Brokers (IBKR) integration (Stage 4)

Primary **BRK-001** (IBKR connect — continues at 030), with **JOB-004** (IBKR poll listener),
**TRADE-001** (order-placement adapter). Source: `backend/app/brokers/ibkr.py` (OAuth 1.0a HMAC-SHA256,
`verify_connection`, `place_order` stocks-only, `get_positions`, `_request` 20s timeout),
`backend/app/services/ibkr_listener.py` (3s poll), `backend/app/schemas/broker.py::IbkrCredentialsIn`,
`backend/app/api/brokers.py::connect`.

> **Confidence caveat (baseline §26/§3):** the IBKR adapter is documented **"untested against live IBKR
> yet."** Options placement is **Unimplemented** (`raise ValueError`); `replace_order` / `get_pnl_snapshot`
> are not implemented. Cases that require a **real IBKR paper environment** are marked **`status:
> Blocked`**; cases verifiable from source/schema or via the fake failure path are **Draft** and labeled
> **Partially Confirmed (source-only)** in the body. **Do not mark IBKR behavior Confirmed without a
> live IBKR paper run.**

**Environment:** `[local-qa]`. No live IBKR is available; connection/verification/listener/order paths
that need it are Blocked. **Never production. Never a funded IBKR account.**

---
```yaml
id: TC-BRK-001-031
title: Missing IBKR OAuth fields are rejected by schema validation (422)
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
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_031_ibkr_missing_fields.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, ibkr, negative, P1]
source_refs: [backend/app/schemas/broker.py::IbkrCredentialsIn (consumer_key/signing_key/access_token/secret/account_id bounds)]
evidence_requirements: [Missing/short OAuth fields → 422 before any broker call]
```
**Confidence:** Partially Confirmed (schema-level; no live IBKR needed).
**Steps (data-driven):** omit consumer_key; signing_key < 20 chars; missing account_id.
**Expected Results:** 422 field validation; no broker verification attempted.

---
```yaml
id: TC-BRK-001-032
title: IBKR connection verification failure rolls back cleanly (invalid creds / invalid account)
primary_func_id: BRK-001
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
automation_ref: automation/integration/test_tc_brk_001_032_ibkr_verify_fail.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, ibkr, negative, destructive, P1]
source_refs: [backend/app/api/brokers.py::_credentials_for (IBKR verify_connection → 400 on RuntimeError / ibkr_error), backend/app/brokers/ibkr.py::_request (401→RuntimeError)]
evidence_requirements: [Invalid creds/account → 400; no account persisted; rollback]
```
**Confidence:** Partially Confirmed (failure path simulated; real IBKR 401 shape unverified).
**Steps:** 1) Connect IBKR with creds that fail verification (simulated 401/RuntimeError).
**Expected Results:** 400 (`ibkr_error` / broker_error); rollback; no account. Real IBKR error shapes require a live run (see Blocked umbrella).

---
```yaml
id: TC-BRK-001-030
title: Valid IBKR OAuth connection verifies and connects
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
owner: unassigned
status: Blocked
last_reviewed: 2026-07-30
tags: [integration, brokers, ibkr, blocked, P1]
source_refs: [backend/app/brokers/ibkr.py::verify_connection, backend/app/api/brokers.py::connect]
evidence_requirements: [BLOCKED: requires a live IBKR paper environment to verify a real connection]
```
**BLOCKED:** no live IBKR paper environment is available; a valid connection cannot be verified end-to-end. Source path is present but unvalidated (baseline §26). Unblock when an IBKR paper sandbox is provisioned.

---
```yaml
id: TC-JOB-004-001
title: IBKR poll listener startup and cadence (3s)
primary_func_id: JOB-004
related_func_ids: [BRK-001]
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
owner: unassigned
status: Blocked
last_reviewed: 2026-07-30
tags: [integration, brokers, ibkr, listener, blocked, P1]
source_refs: [backend/app/services/ibkr_listener.py (POLL_INTERVAL_S=3.0, status-only dedup, unscoped lookup — baseline §27)]
evidence_requirements: [BLOCKED: needs live IBKR. Source-only note: status-only dedup + unscoped scalar_one_or_none can raise MultipleResultsFound]
```
**BLOCKED:** requires live IBKR to exercise the poll listener. **Partially Confirmed (source-only):** the IBKR listener uses a **status-only** dedup fingerprint and an **unscoped** DB lookup (`scalar_one_or_none` on `broker_order_id` alone), which can miss broker-side modifies and raise `MultipleResultsFound` (baseline §27). Record these as **Potential** risks to verify once unblocked — do not file as Confirmed.

---
```yaml
id: TC-TRADE-001-012
title: IBKR order-placement adapter — stocks supported, options Unimplemented
primary_func_id: TRADE-001
related_func_ids: [BRK-001, OPT-001]
module: brokers
test_level: L2
test_type: Negative
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/integration/test_tc_trade_001_012_ibkr_order_adapter.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [integration, brokers, ibkr, negative, P1]
source_refs: [backend/app/brokers/ibkr.py::place_order (option → raise ValueError "not yet implemented"; get_order scans recent-orders; replace_order/get_pnl_snapshot NotImplemented)]
evidence_requirements: [IBKR OPTION order raises ValueError (Unimplemented); stock order path present but live-Blocked]
```
**Confidence:** Partially Confirmed (source): option placement is explicitly unimplemented; stock placement live-Blocked.
**Steps:** 1) Attempt an IBKR option order. 2) Note stock order path.
**Expected Results:** Option → ValueError / handled as unsupported (Unimplemented); stock placement cannot be confirmed without live IBKR (Blocked). `replace_order`/`get_pnl_snapshot` are NotImplemented.

---
```yaml
id: TC-BRK-001-033
title: IBKR request timeout and network failure handling (20s)
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L3
test_type: Recovery
priority: P1
risk: Medium
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
automation_ref: automation/api/tests/brokers/test_tc_brk_001_033_ibkr_timeout.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, ibkr, recovery, P1]
source_refs: [backend/app/brokers/ibkr.py::_request (timeout=20s default; ≥400 → RuntimeError; network error wrapped)]
evidence_requirements: [Timeout/network error → RuntimeError surfaced as a clean connect error; no partial account]
```
**Confidence:** Partially Confirmed (source): 20s timeout + error wrapping verifiable via simulated failure.
**Steps:** 1) Simulate a timeout / network error on `_request`.
**Expected Results:** Wrapped RuntimeError → clean 400 on connect; rollback.

---
```yaml
id: TC-BRK-001-034
title: IBKR OAuth signature failure / Live Session Token handshake
primary_func_id: BRK-001
related_func_ids: []
module: brokers
test_level: L3
test_type: Negative
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: true
automation_status: Not Automated
owner: unassigned
status: Blocked
last_reviewed: 2026-07-30
tags: [integration, brokers, ibkr, blocked, P1]
source_refs: [backend/app/brokers/ibkr.py (OAuth1 HMAC-SHA256; docstring: may need LST/DH handshake if /iserver/* returns 401)]
evidence_requirements: [BLOCKED: OAuth signature / LST handshake behavior requires a live IBKR environment]
```
**BLOCKED:** OAuth signature validation and the possible Live-Session-Token DH handshake cannot be exercised without live IBKR (baseline §3). Document as unvalidated; unblock with a sandbox.

---
```yaml
id: TC-BRK-001-035
title: IBKR OAuth credentials are encrypted at rest
primary_func_id: BRK-001
related_func_ids: [SEC-001]
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
automation_ref: automation/api/tests/brokers/test_tc_brk_001_035_ibkr_encryption.spec.ts
owner: unassigned
status: Draft
last_reviewed: 2026-07-30
tags: [api, brokers, ibkr, security, P0]
source_refs: [backend/app/services/crypto.py::encrypt_json (broker-agnostic Fernet), backend/app/models/broker_account.py]
evidence_requirements: [IBKR OAuth keys (consumer_key/signing_key/access_token/secret) stored only as Fernet ciphertext; never in responses/logs]
```
**Confidence:** Partially Confirmed (encryption is broker-agnostic; validated generically by TC-BRK-001-012).
**Steps:** 1) With IBKR creds staged for encryption, confirm the stored blob is Fernet ciphertext.
**Expected Results:** OAuth signing keys/tokens encrypted at rest; never exposed. Credential-encryption safety (P0). Full end-to-end persistence via a real connect is Blocked (see TC-BRK-001-030).

---
```yaml
id: TC-BRK-001-036
title: IBKR account replacement and disconnect
primary_func_id: BRK-001
related_func_ids: [JOB-004]
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
owner: unassigned
status: Blocked
last_reviewed: 2026-07-30
tags: [integration, brokers, ibkr, blocked, data-integrity, P1]
source_refs: [backend/app/api/brokers.py::_evict_existing_brokers, delete_broker]
evidence_requirements: [BLOCKED live: replacement/disconnect logic is broker-agnostic (covered by TC-BRK-001-003/004) but IBKR end-to-end needs a live connect]
```
**BLOCKED (live):** replacement/disconnect logic is broker-agnostic and covered by TC-BRK-001-003/004; the IBKR-specific end-to-end path requires a live connect to seed the account. Confidence: Partially Confirmed via the generic path.

---
```yaml
id: TC-BRK-001-037
title: Documented BLOCKED set — IBKR integration not validated against a real IBKR paper environment
primary_func_id: BRK-001
related_func_ids: [JOB-004, TRADE-001]
module: brokers
test_level: L3
test_type: Functional
priority: P1
risk: High
environment: [local-qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
owner: unassigned
status: Blocked
last_reviewed: 2026-07-30
tags: [brokers, ibkr, blocked, P1]
source_refs: [backend/app/brokers/ibkr.py (docstring: untested against live IBKR), baseline §26]
evidence_requirements: [Explicit record of what is blocked pending an IBKR paper sandbox]
```
**BLOCKED (umbrella):** The following IBKR behaviors are **blocked** until a real IBKR **paper** environment
is provisioned and credentials are owned by DevOps: valid connection/verification (TC-BRK-001-030),
listener poll behavior (TC-JOB-004-001), OAuth signature/LST handshake (TC-BRK-001-034), live stock
order placement (TC-TRADE-001-012 stock path), and account replacement end-to-end (TC-BRK-001-036).
**Do not mark any IBKR behavior Confirmed until this environment exists.** Automation candidate: no
(pending environment).
