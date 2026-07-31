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
