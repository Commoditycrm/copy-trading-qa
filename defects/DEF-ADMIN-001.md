# DEF-ADMIN-001 — `user_role` enum label case drift makes every admin endpoint return 500

- **Severity:** High (functional: Critical for the admin surface) · **Priority:** P0 · **Status:** Confirmed (reproduced ×2+, both twice-through runs) · **Date:** 2026-08-04
- **Module:** admin / data-model · **Functionality ID:** ADMIN-001 · **Confirming test:** `TC-ADMIN-001-005`
- **Environment:** local-qa stack (backend builds its schema via `alembic upgrade head`) · **Build:** app repo `qa-branch`, alembic head `d5c6b7a8e9f0`
- **Source:** `alembic/versions/f1a2b3c4d5e6_add_admin_role.py` (`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin'`), `app/models/user.py::UserRole` (`str, enum.Enum` — SQLAlchemy persists/reads by member **name**), `app/api/deps.py::require_admin`
- **Root cause — REGRESSION of a previously-fixed bug:** the fix migration `c4f1a9d3e7b2_fix_admin_enum_label_case` (authored earlier to fix BUG-AUTH-001, `RENAME VALUE admin→ADMIN`) is **missing from `qa-branch`** — only a stale `alembic/versions/__pycache__/c4f1a9d3e7b2_*.pyc` remains; the `.py` source is gone, so alembic cannot include it in the chain and `upgrade head` leaves the drift unfixed.

## Summary
The `UserRole` enum column is a plain SQLAlchemy `Enum(UserRole)`, so Postgres stores and the ORM reads
the enum **member names** — `TRADER`, `SUBSCRIBER`, `ADMIN` (existing rows are uppercase, e.g. `SUBSCRIBER`).
The `add_admin_role` migration, however, added the label in **lowercase** (`'admin'`) using the enum's
*value* rather than its name. No later migration corrects it — even though an earlier migration
(`f9c2e3d8a1b7_fix_enum_case_drift`) fixed exactly this class of bug for `order_status` / `retry_interval`.

Consequently, at the current alembic head the `user_role` enum contains the labels
`{TRADER, SUBSCRIBER, admin}`. Any user with `role='admin'` cannot be deserialized by the ORM. Because
every `/api/admin/*` route depends on `require_admin`, which loads the **admin's own user row**, the row
load raises `LookupError` and the request fails with **HTTP 500** before any handler logic runs. The admin
panel is entirely non-functional on a clean deploy, and an admin cannot be created through the ORM either
(writing member name `'ADMIN'` is rejected — that label does not exist in the DB enum).

## Reproduction (deterministic)
1. Register a synthetic user; promote it to the **shipped** label: `UPDATE users SET role='admin' …`.
2. Mint/obtain a valid admin token for that user.
3. `GET /api/admin/stats` (or any `/api/admin/*` route).

## Expected vs Actual
- **Expected:** `200 OK` with the stats payload (admin is authorized).
- **Actual:** `500 Internal Server Error`. Backend trace:
  ```
  LookupError: 'admin' is not among the defined enum values.
  Enum name: user_role. Possible values: TRADER, SUBSCRIBER, ADMIN
  ...
  "GET /api/admin/stats HTTP/1.1" 500 Internal Server Error
  ```

## Evidence (redacted)
```
enum_range(user_role) = {TRADER, SUBSCRIBER, admin}      # 'admin' lowercase; others by NAME
GET /api/admin/stats  (role='admin' shipped label)  -> 500  (LookupError: 'admin' not in enum)
```
Reproduced across the initial run (all admin endpoints 500'd — stats/users/rejected/config/sms) and by the
dedicated `TC-ADMIN-001-005` on both twice-through admin suite executions (2/2). Not an env/harness
artifact: the schema is produced by the app's own `alembic upgrade head`, and the same enum-by-name
convention works for `TRADER`/`SUBSCRIBER` rows.

## Impact
Admin functionality is completely broken on a fresh deploy at head: dashboards, user management, rejected-
order triage, load-test tooling, runtime config, test-SMS, broker/listener health, and position reconcile
all 500. There is no in-app workaround — an admin account cannot be created or read through the ORM.

## QA remediation (test environment only — app repo is read-only)
To exercise the remaining 27 admin areas, the QA harness adds the correct label to the disposable QA DB
(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN'`) and promotes synthetic admins to `ADMIN`. The
buggy lowercase label is intentionally left in place so `TC-ADMIN-001-005` keeps reproducing the shipped
500. This is a harness-side unblock, **not** a fix of the product.

## Suggested fix (app team)
**Restore the lost fix migration** `c4f1a9d3e7b2_fix_admin_enum_label_case.py` to `alembic/versions/` (it is
already referenced by a stale `.pyc` and was authored for BUG-AUTH-001) so it re-enters the chain to head —
or equivalently ship a fresh migration `ALTER TYPE user_role RENAME VALUE 'admin' TO 'ADMIN';` (mirroring
`f9c2e3d8a1b7_fix_enum_case_drift`) and migrate any pre-existing lowercase `admin` rows. Also add a CI guard
that fails if `__pycache__` contains a migration whose `.py` source is absent (this regression would have been
caught). The confirming test flips to a `200` expectation once fixed.
