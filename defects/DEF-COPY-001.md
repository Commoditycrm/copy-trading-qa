# DEF-COPY-001 — Transient-retry of a CLOSE mirror resets `is_closing` to false

- **Severity:** High · **Priority:** P1 · **Status:** Fixed — Verified (was Confirmed; reproduced ×2, both twice-through runs) · **Date:** 2026-07-31
- **Module:** copy-engine · **Functionality ID:** COPY-003 · **Confirming test:** `TC-COPY-003-007`
- **Environment:** local-qa stack + controllable QA mock broker · **Build:** app repo `qa-branch`
- **Source:** `backend/app/services/copy_engine.py` transient-park branch (`child.is_closing = False  # TODO: close-detection`) · baseline §27

## Summary
When a subscriber's **closing** mirror order hits a transient broker error and is parked for retry, the
copy engine unconditionally sets `child.is_closing = False` (there is an explicit `# TODO: close-detection`
at that line). A parked CLOSE therefore loses its close semantics: on retry the scheduler treats it as an
**opening** order — it uses the *open* retry interval instead of the close interval, and downstream logic
that depends on `is_closing` (e.g. SELL_TO_CLOSE routing, close-clamp) no longer recognises it as a close.

## Reproduction (deterministic, via the QA mock broker)
1. Trader + 1 subscriber (copy on, `retry_interval_open=1m`), both on fake broker accounts.
2. Trader BUY 10 → subscriber mirror; fill-sync the subscriber's mirror to **10** (they hold 10).
3. Configure the mock broker so the subscriber's next place is a **transient** error.
4. Trader closes the position (reverse SELL 10) → the subscriber's CLOSE mirror is placed and hits the
   transient error → parked `RETRY_PENDING`.
5. Read the parked child row.

## Expected vs Actual
- **Expected (manual TC-COPY-002-014):** a parked CLOSE keeps `is_closing = true` and uses the *close*
  retry interval.
- **Actual:** `status = retry_pending`, **`is_closing = false`**.

## Evidence (redacted)
```
run 1: parked child → status=retry_pending, is_closing=false
run 2: parked child → status=retry_pending, is_closing=false
```
Reproduced 2/2 across both twice-through suite executions. Env/mock ruled out: the same harness parks an
*opening* transient mirror correctly (TC-COPY-003-001), and a user-fixable error rejects without retry
(TC-COPY-003-004); only the close-semantics flag is wrong.

## Impact
A retried close can be mis-scheduled on the open interval and, on brokers that need explicit
SELL_TO_CLOSE / position-aware routing, may be rejected or (worst case) treated as an opening order.
Silent — no error surfaced to the subscriber.

## Suggested fix (app team — QA does not modify the app)
Preserve the order's existing `is_closing` on the transient-park path (or recompute close-detection there)
instead of forcing it to `False`. The confirming test flips to expected-behavior assertions once fixed.

## Resolution — Fixed — Verified (2026-08-06)
- **Fixed on:** application `origin/main` @ `d8724f5`. **Fix:** a transient-parked CLOSE mirror retains `is_closing=true` instead of resetting it to false.
- **Verification:** `TC-COPY-003-007` re-pointed to assert the parked CLOSE keeps `is_closing=true` (DB-confirmed), run @trading serially. Re-verified twice on a fresh migrated DB (Alembic-from-zero, fake broker, no QA remediation). See `docs/VERIFICATION_NOTES.md`.
