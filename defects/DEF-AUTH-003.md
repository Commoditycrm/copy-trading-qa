# DEF-AUTH-003 — Mixed/upper-case forgot-password silently fails to match (no reset link)

- **Severity:** Medium · **Priority:** P2 · **Status:** Confirmed (reproduced ×2 + control) · **Date:** 2026-07-31
- **Module:** auth · **Functionality ID:** AUTH-004 · **Confirming test:** `TC-AUTH-004-006`
- **Environment:** local-qa stack · **Build:** app repo `qa-branch` (API v0.2.0)
- **Source:** `backend/app/schemas/auth.py::ForgotPasswordIn` (no `_normalize_email`, unlike `LoginIn`/`RegisterIn`) · baseline §27

## Summary
`POST /api/auth/forgot-password` with a mixed/upper-case email does **not** match the stored (lowercased)
account, so **no reset link is generated** — yet the endpoint returns the same generic 200
(anti-enumeration), so the user gets no email and no error. A legitimate user who types their email with
different casing silently cannot reset their password.

## Reproduction (×2, with control)
1. Register a user (email stored lowercased) → 201.
2. `POST /api/auth/forgot-password` with the **UPPERCASED** email → 200 (generic).
3. Inspect the email sink for a `type=reset` token for that user id → **none produced**.
- **Control:** repeat step 2 with the **lowercase** email → a reset token **is** produced.

## Expected vs Actual
- **Expected:** email lookup is case-insensitive (like login/registration normalization) → reset link sent.
- **Actual:** uppercase → **no reset token**; lowercase → reset token. The 200 masks the miss.

## Evidence (redacted)
```
run 1: upperCaseResetToken=false  lowerCaseResetToken=true
run 2: upperCaseResetToken=false  lowerCaseResetToken=true
```
Reproduced 2/2; control (lowercase) confirms the account and sink work.

## Impact
Usability + account-recovery reliability; the anti-enumeration 200 hides the failure so users can't tell
why no email arrived. **Fix:** normalize the email on `ForgotPasswordIn` (and `ResendVerificationIn`).
