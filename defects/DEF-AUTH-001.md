# DEF-AUTH-001 — `POST /api/auth/refresh` returns HTTP 500 on a malformed `sub`

- **Severity:** High · **Priority:** P1 · **Status:** Fixed — Verified (was Confirmed; reproduced ×3) · **Date:** 2026-07-31
- **Module:** auth · **Functionality ID:** AUTH-003 · **Confirming test:** `TC-AUTH-003-002`
- **Environment:** local-qa stack (fake broker) · **Build:** app repo `qa-branch` (API v0.2.0)
- **Source:** `backend/app/api/auth.py::refresh` (`payload["sub"]` + `uuid.UUID(...)` unguarded) · baseline §27

## Summary
When a refresh token decodes successfully but carries a missing or non-UUID `sub`, the endpoint raises an
unhandled `KeyError`/`ValueError` and returns **HTTP 500 Internal Server Error** instead of the intended
**401**. Crafted input reaches an unhandled exception on an unauthenticated endpoint.

## Reproduction (deterministic — no test data)
1. Mint a JWT signed with the server's secret: `{ "sub": "not-a-uuid", "type": "refresh" }` (HS256).
2. `POST /api/auth/refresh` with `{ "refresh_token": "<token>" }`.

## Expected vs Actual
- **Expected:** 401 (`invalid_token`), consistent with `current_user`'s defensive handling.
- **Actual:** 500 `Internal Server Error`.

## Evidence (redacted)
```
attempt 1: status=500 body=Internal Server Error
attempt 2: status=500 body=Internal Server Error
attempt 3: status=500 body=Internal Server Error
```
Reproduced 3/3. Env/test-data ruled out: the token is minted deterministically (no DB/user dependency);
a well-formed refresh token returns 200 (TC-AUTH-003-001), a wrong-type token returns 401 (TC-AUTH-003-003).

## Impact
Unauthenticated 500 on crafted input — robustness/security-adjacent; noisy 5xx, masks the correct 401
contract, and could be probed. **Fix:** guard `sub` extraction/parse and return 401 on invalid.

## Resolution — Fixed — Verified (2026-08-06)
- **Fixed on:** application `origin/main` @ `d8724f5`. **Fix:** guard the malformed `sub` claim so `auth/refresh` returns 401, not 500.
- **Verification:** `TC-AUTH-003-002` asserts 401 on a malformed sub. Re-verified twice on a fresh migrated DB (Alembic-from-zero, fake broker, no QA remediation). See `docs/VERIFICATION_NOTES.md`.
