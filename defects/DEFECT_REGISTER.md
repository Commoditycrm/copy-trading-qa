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

All three confirm baseline §27 items. All are behavior defects (no fix applied — app repo is read-only; QA reports, app team fixes).

## Test-data / environment findings (harness — NOT app defects)

| Ref | Finding | Resolution |
|---|---|---|
| TD-001 | App `EmailStr` rejects special-use TLDs (`.test`/`.example`/`.invalid`); synthetic `@kopyya.test` emails 422 at registration | Harness now uses `@qa.kopyya.dev` (`QA_EMAIL_DOMAIN`); documented in `docs/TEST_DATA_STRATEGY.md` |
| TD-002 | Per-IP register throttle (15/hr) bled across tests → 429 | Harness sends a unique `X-Forwarded-For` per user to isolate the throttle |
| TD-003 | Email-sink matched tokens by `sub` only → sometimes picked the verify token (wrong type) | Matcher now filters by claim `type` (`reset`/`verify`) |

## Known/Potential (other modules — not yet executed)

| Ref | Finding | Confirming test | State |
|---|---|---|---|
| §24 | SSE token carried in URL query (logging exposure) | TC-NOTIF-001-018 | Potential |
| §15.3 | Unauthenticated SnapTrade webhook / poll-amplification | TC-BRK-003-002 | Potential |
| §17 | `max_per_contract` accepted/persisted but unenforced | TC-RISK-005-003 | Potential |
| §27 | `is_closing` reset on transient retry (copy engine) | TC-COPY-003-007 | **Confirmed → DEF-COPY-001** (mock-broker reproduced ×2) |
| RISK-002 | Auto-liquidation triggers on **unrealized-profit ≥ limit** (take-profit) but model/schema/API docstrings + manual describe an **equity floor**. Code is internally consistent (`copy.auto_liquidated_take_profit`); the spec/docs are misleading. | TC-RISK-002-002 | Potential (doc/impl mismatch — reproduced ×2; needs product confirmation, not filed as a code defect) |
| RISK-001 | Next-day auto-resume: the **fanout** resume sweep iterates only `copy_enabled=true` subs (`get_subscribers_for_trader`), so it can never re-enable a `copy_enabled=false` auto-paused sub. Resume works via the **poller** (`pnl_poller._enforce_one`). Feature functions; the fanout sweep is effectively redundant/dead for the normal paused state, and TC-RISK-001-009's "on the next fanout" wording is inaccurate. | TC-RISK-001-009 | Observation (reproduced ×2; automated via the poller path) |
| BRK-001 | **Connect eviction commits before verification** — `connect` (`api/brokers.py:644`) calls `_evict_existing_brokers` (deletes the user's existing broker, `db.flush` uncommitted, `:248-271`) BEFORE `verify_connection` (`:662`). On a verify failure the `except` branch `db.commit()`s (`:674`) the pending eviction, while the new account is only `db.add`-ed on success (`:677`). Net: a failed replace would leave the user with **NO broker** (old committed-deleted, new never persisted, listener already stopped). Same pattern in `snaptrade_finish` (`:557`/`:585`). | TC-BRK-001-003 / 001-016 | **Potential (high) — NOT yet runtime-reproduced.** Evidence is code-review only; per policy it stays Potential until reproduced twice at runtime. **Environment needed to confirm:** a controllable Alpaca/SnapTrade adapter that returns a verify FAILURE without outbound (an offline adapter stub or a base-URL-redirected fixture) so the user can hold an existing broker, attempt a replace that fails verify, and observe the old row committed-deleted. Recommend the app team reorder evict-after-verify or wrap in a savepoint. |
| BRK-003 | SnapTrade webhook is **unauthenticated / no signature verification** (`api/brokers.py:282`, explicit "not enforced yet" note). A forged call for a known trader id schedules an extra poll — no fake-trade injection (SnapTrade dedups by broker id), but a **poll-amplification** vector. | TC-BRK-003-002 | Potential (automated — asserts the accepted risk; baseline §15.3) |
