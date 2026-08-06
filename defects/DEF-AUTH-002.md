# DEF-AUTH-002 — Password reset accepts a weaker password than registration allows

- **Severity:** High · **Priority:** P1 · **Status:** Fixed — Verified (was Confirmed; reproduced ×2 + control) · **Date:** 2026-07-31
- **Module:** auth · **Functionality ID:** AUTH-004 (related AUTH-001) · **Confirming test:** `TC-AUTH-004-004`
- **Environment:** local-qa stack · **Build:** app repo `qa-branch` (API v0.2.0)
- **Source:** `backend/app/schemas/auth.py::ResetPasswordIn` (`min_length=8,max_length=128`, **no strength
  check**) vs `RegisterIn::_validate_password_strength` (≥3 char classes, ≤72 bytes) · baseline §27

## Summary
`POST /api/auth/reset-password` accepts an 8-character all-lowercase password (`abcdefgh`) that
**registration rejects (422)**. A user can set — or an attacker who obtains a reset link can set — a
password weaker than the platform's own registration policy. It also accepts 73–128-char inputs that
exceed bcrypt's 72-byte limit (silent truncation).

## Reproduction (×2, with control)
1. Register a user with a strong password → 201.
2. `POST /api/auth/forgot-password`; obtain the reset token from the email sink (type=`reset`).
3. `POST /api/auth/reset-password` with `new_password = "abcdefgh"`.
- **Control:** `POST /api/auth/register` with `password = "abcdefgh"` → **422** (registration rejects it).

## Expected vs Actual
- **Expected:** reset enforces the same strength/length policy as registration → reject `abcdefgh`.
- **Actual:** reset **succeeds (200)** — "Your password has been reset."

## Evidence (redacted)
```
run 1: gotResetToken=true  resetWeakStatus=200  body={"detail":"Your password has been reset..."}
run 2: gotResetToken=true  resetWeakStatus=200  body={"detail":"Your password has been reset..."}
control (register abcdefgh): 422
```
Reproduced 2/2; control confirms the asymmetry is real (not a globally-weak policy).

## Impact
Security — password-policy bypass via the reset path; weaker credentials than registration permits.
**Fix:** apply `_validate_password_strength` (and the 72-byte cap) to `ResetPasswordIn`.

## Resolution — Fixed — Verified (2026-08-06)
- **Fixed on:** application `origin/main` @ `d8724f5`. **Fix:** password reset now applies the same strength policy as registration (weak passwords rejected).
- **Verification:** `TC-AUTH-004-004` re-pointed to assert a weak reset is rejected (≥400, not 200). Re-verified twice on a fresh migrated DB (Alembic-from-zero, fake broker, no QA remediation). See `docs/VERIFICATION_NOTES.md`.
