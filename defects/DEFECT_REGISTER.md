# Defect Register

A finding becomes a **Confirmed Defect** only after: (1) reproduced **twice**, (2) environment/test-data
causes ruled out, (3) expected behavior verified, (4) redacted evidence captured. See
`docs/DEFECT_MANAGEMENT_PROCESS.md` §7.

## Confirmed defects

| Defect ID | Sev | Title | Confirming test | Reproduced | File |
|---|---|---|---|---|---|
| **DEF-AUTH-001** | High | `auth/refresh` returns 500 (expected 401) on malformed `sub` | TC-AUTH-003-002 | ×3 | [DEF-AUTH-001.md](DEF-AUTH-001.md) |
| **DEF-AUTH-002** | High | Password reset accepts a weaker password than registration | TC-AUTH-004-004 | ×2 + control | [DEF-AUTH-002.md](DEF-AUTH-002.md) |
| **DEF-AUTH-003** | Medium | Mixed-case forgot-password silently no-match (no reset link) | TC-AUTH-004-006 | ×2 + control | [DEF-AUTH-003.md](DEF-AUTH-003.md) |
| **DEF-COPY-001** | High | Transient-retry of a CLOSE mirror resets `is_closing` to false | TC-COPY-003-007 | ×2 | [DEF-COPY-001.md](DEF-COPY-001.md) |
| **DEF-ADMIN-001** | High | `user_role` enum label case drift (regression — fix migration `c4f1a9d3e7b2` missing from `qa-branch`) — every `/api/admin/*` returns 500 for a real admin | TC-ADMIN-001-005 | ×2+ | [DEF-ADMIN-001.md](DEF-ADMIN-001.md) |
| **DEF-UI-001** | Medium | `/brokers` white-screens (client-side exception) when a user holds a broker name not in the frontend `BROKER_META` (e.g. `fake`) — `BrokerAvatar` derefs `meta.name` with no fallback | TC-WF-06-002 | ×2+ | [DEF-UI-001.md](DEF-UI-001.md) |

All are behavior defects (no fix applied — app repo is read-only; QA reports, app team fixes). DEF-AUTH-*/COPY-001
confirm baseline §27 items; **DEF-ADMIN-001** is a migration/ORM enum-case mismatch that renders the entire
admin surface non-functional on a clean deploy (root cause + suggested `RENAME VALUE` fix in the file).

## Test-data / environment findings (harness — NOT app defects)

| Ref | Finding | Resolution |
|---|---|---|
| TD-001 | App `EmailStr` rejects special-use TLDs (`.test`/`.example`/`.invalid`); synthetic `@kopyya.test` emails 422 at registration | Harness now uses `@qa.kopyya.dev` (`QA_EMAIL_DOMAIN`); documented in `docs/TEST_DATA_STRATEGY.md` |
| TD-002 | Per-IP register throttle (15/hr) bled across tests → 429 | Harness sends a unique `X-Forwarded-For` per user to isolate the throttle |
| TD-003 | Email-sink matched tokens by `sub` only → sometimes picked the verify token (wrong type) | Matcher now filters by claim `type` (`reset`/`verify`) |

## Known/Potential (other modules — not yet executed)

| Ref | Finding | Confirming test | State |
|---|---|---|---|
| §24 | SSE token carried in URL query (`GET /api/events?token=`) — access-log exposure risk. Behavior confirmed (EventSource can't set headers, so the token is structurally in the query), but **impact not runtime-confirmed** (no uvicorn access-log capture proving a leak). Kept **Potential** per policy. | TC-NOTIF-001-018 | Potential |
| NOTIF-015 | Broker-error content in notifications/SMS is **truncated, not credential-scrubbed** (`copy.rejected` message = raw broker error `[:180]`; no sanitizer). No current path echoes a secret, but a broker that returned a secret in an error string would surface it. | TC-NOTIF-001-015 (manual) | Potential (redaction-by-truncation only; recommend a scrubber) |
| §15.3 | Unauthenticated SnapTrade webhook / poll-amplification | TC-BRK-003-002 | Potential |
| OPT-004 | `GET /api/options/quote?debug=1` attaches a `_debug` dict (adapter class, connection_status, error type/message + up to 1500 chars of stack trace) to the response for any authenticated account owner — internals/stack-trace disclosure. | TC-OPT-001-004 | Potential (owner-only, but a debug flag should not surface a stack trace in prod) |
| §17 | `max_per_contract` accepted/persisted but unenforced | TC-RISK-005-003 | Potential |
| §27 | `is_closing` reset on transient retry (copy engine) | TC-COPY-003-007 | **Confirmed → DEF-COPY-001** (mock-broker reproduced ×2) |
| RISK-002 | Auto-liquidation triggers on **unrealized-profit ≥ limit** (take-profit) but model/schema/API docstrings + manual describe an **equity floor**. Code is internally consistent (`copy.auto_liquidated_take_profit`); the spec/docs are misleading. | TC-RISK-002-002 | Potential (doc/impl mismatch — reproduced ×2; needs product confirmation, not filed as a code defect) |
| RISK-001 | Next-day auto-resume: the **fanout** resume sweep iterates only `copy_enabled=true` subs (`get_subscribers_for_trader`), so it can never re-enable a `copy_enabled=false` auto-paused sub. Resume works via the **poller** (`pnl_poller._enforce_one`). Feature functions; the fanout sweep is effectively redundant/dead for the normal paused state, and TC-RISK-001-009's "on the next fanout" wording is inaccurate. | TC-RISK-001-009 | Observation (reproduced ×2; automated via the poller path) |
| BRK-001 | **Connect eviction commits before verification** — `connect` (`api/brokers.py:644`) calls `_evict_existing_brokers` (deletes the user's existing broker, `db.flush` uncommitted, `:248-271`) BEFORE `verify_connection` (`:662`). On a verify failure the `except` branch `db.commit()`s (`:674`) the pending eviction, while the new account is only `db.add`-ed on success (`:677`). Net: a failed replace would leave the user with **NO broker** (old committed-deleted, new never persisted, listener already stopped). Same pattern in `snaptrade_finish` (`:557`/`:585`). | TC-BRK-001-003 / 001-016 | **Potential (high) — NOT yet runtime-reproduced.** Evidence is code-review only; per policy it stays Potential until reproduced twice at runtime. **Environment needed to confirm:** a controllable Alpaca/SnapTrade adapter that returns a verify FAILURE without outbound (an offline adapter stub or a base-URL-redirected fixture) so the user can hold an existing broker, attempt a replace that fails verify, and observe the old row committed-deleted. Recommend the app team reorder evict-after-verify or wrap in a savepoint. |
| BRK-003 | SnapTrade webhook is **unauthenticated / no signature verification** (`api/brokers.py:282`, explicit "not enforced yet" note). A forged call for a known trader id schedules an extra poll — no fake-trade injection (SnapTrade dedups by broker id), but a **poll-amplification** vector. | TC-BRK-003-002 | Potential (automated — asserts the accepted risk; baseline §15.3) |
| ADMIN-002 | **Admin mutating actions are not audited.** `activate`/`deactivate`/`role`/`business-name` (`api/admin.py`) emit only `log.info` — no `audit_logs` row is written (the only `audit.record` in the admin/service layer is `position.reconciled`). Confirmed at runtime: after a deactivate + role-change, `audit_logs` count for those actions is 0. Governance gap, not a code defect — if admin auditability is required, these mutations should record actor/target/change. | TC-ADMIN-001-003 | Observation (reproduced ×2; automated — asserts the absence) |
| ADMIN-005 | **Doc/brief mismatch on config bound.** The engagement brief cites the Alpaca P&L poll-interval range as 5–300s; the implementation (`services/platform_config.py`) enforces **1–300s** (interval `1` accepted, `0`→422, `400`→422). Not a defect — the app is internally consistent; the brief is stale. Fanout-batch-threshold bound (1–10000) matches. | TC-ADMIN-005-002 | Observation (impl 1–300, not 5–300; automated to the impl bound) |
