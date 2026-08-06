# DEF-UI-001 — /brokers white-screens (client-side exception) for a broker name not in `BROKER_META`

- **Severity:** Medium (latent in prod; hard-blocks graceful handling of any unmapped broker) · **Priority:** P2 · **Status:** Fixed — Verified (was Confirmed; reproduced deterministically ×2+) · **Date:** 2026-08-04
- **Module:** frontend / brokers · **Functionality ID:** WF-06 (BRK-001) · **Confirming test:** `TC-WF-06-002`
- **Environment:** local-qa full stack (Next.js frontend + QA backend) · **Build:** app repo `qa-branch`
- **Source:** `frontend/app/(app)/brokers/page.tsx` — `BrokerAvatar` (`:41` `const meta = BROKER_META[broker];` → `:56` `{meta.name[0]}`)

## Summary
The `/brokers` page renders a `BrokerAvatar` for each connected account. The avatar reads
`const meta = BROKER_META[broker]` and then dereferences `meta.name[0]` **without a fallback**. When a user
holds a broker account whose `broker` value is not a key in the frontend `BROKER_META` map, `meta` is
`undefined` and `meta.name[0]` throws — an unhandled React render exception that **white-screens the entire
page** ("Application error: a client-side exception has occurred"). Other code in the same file guards this
exact lookup (`:596` `meta && …`, `:921` `BROKER_META[acct.broker]?.name ?? acct.broker`), so the avatar is
an inconsistent, unguarded path.

## Reproduction (deterministic)
1. Give a user a broker account whose name is not in `BROKER_META` (the QA `fake` broker; API-seeded).
2. Log in and open `/brokers`.
3. The page throws and renders only the global error fallback — no heading, no account, no picker.

## Expected vs Actual
- **Expected:** the page renders; an unknown broker degrades gracefully (e.g. show the raw broker name, as
  `:921` already does).
- **Actual:** whole-page crash — `TypeError: Cannot read properties of undefined (reading 'name')` in
  `BrokerAvatar`; "Application error: a client-side exception has occurred".

## Evidence (redacted)
```
seed: broker_accounts.broker = 'fake' for the logged-in trader
GET /brokers → document renders "Application error: a client-side exception has occurred"
              (heading "Broker connections" count = 0)
```
Reproduced 2×+: the initial broker page-render and disconnect attempts both white-screened, and the dedicated
`TC-WF-06-002` reproduces it on demand across both twice-through UI runs.

## Impact
- **QA:** blocks driving the broker page / disconnect through the UI for any fake account (WF-06 connect of a
  fake account, WF-16 disconnect via UI).
- **Prod:** latent — today's real brokers (alpaca/webull/snaptrade/ibkr) are all in `BROKER_META`, so it does
  not fire for current users. It is a forward-compatibility / robustness defect: adding a new broker
  server-side, a renamed/legacy label, or any data drift that yields an unmapped `broker` value would
  white-screen every affected user's Broker page.

## Suggested fix (app team — QA does not modify the app)
Give `BrokerAvatar` the same fallback the rest of the file uses, e.g. `const meta = BROKER_META[broker] ??
{ name: broker, … }` (or guard `meta?.name?.[0] ?? '?'`). The confirming test flips to expected-behavior
(page renders, account row shown) once fixed.

## Resolution — Fixed — Verified (2026-08-06)
- **Fixed on:** application `origin/main` @ `d8724f5`. **Fix:** `brokerMeta()` returns a neutral fallback for a broker not in `BROKER_META`, so `BrokerAvatar` no longer dereferences `undefined`.
- **Verification:** `TC-WF-06-002` re-pointed: `/brokers` mounts, the fake account is listed via the "Fake" fallback, and no uncaught client-side exception fires. Re-verified twice on a fresh migrated DB (Alembic-from-zero, fake broker, no QA remediation). See `docs/VERIFICATION_NOTES.md`.
