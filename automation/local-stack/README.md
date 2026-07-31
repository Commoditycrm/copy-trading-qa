# Local isolated QA stack

Disposable, **localhost-only** stack for running automated tests against the application without any
production dependency. Builds the app images from the **read-only** app repo (Docker only reads it).

## Services
`db` (postgres:17, ephemeral tmpfs) · `redis` (7-alpine, password) · `backend` (web, `RUN_BACKGROUND_WORKERS=false`)
· `worker` (background, true) · `frontend` (profile `full` only).

## Safety (enforced)
- Localhost port bindings only (`127.0.0.1:8000` backend, `:3000` frontend, `:55432` pg, `:56379` redis).
- Dedicated local QA database (`copytrading_qa`) — **tmpfs, wiped on `down`**.
- QA-only `JWT_SECRET` + `CREDENTIAL_ENCRYPTION_KEY` generated into `qa.env` (gitignored); the same JWT
  secret is synced into `automation/.env` so adversarial-token tests match the server.
- Fake broker only; **no** SnapTrade/SendGrid/Twilio/Alpaca credentials (blank → log/sink mode).
- Destructive tests run only against this local stack.

## One-command scripts (run from `automation/`)
| Command | Action |
|---|---|
| `npm run local:up` | Generate secrets + build & start db/redis/backend/worker |
| `npm run local:up:full` | …also start the frontend (UI E2E) |
| `npm run local:health` | Wait until `/api/health` is ready |
| `npm run local:reset` | `down -v` then `up` (fresh disposable stack) |
| `npm run local:down` | Stop & remove containers + volumes (cleanup) |
| `npm run test:auth` | Run the Authentication/AuthZ automated suite (`@auth`) |
| `npm run test:auth:headed` / `:debug` | Headed / Playwright inspector |

## Cleanup guarantee
`local:down` / `local:reset` remove containers **and** volumes (`-v`), so state never leaks between runs —
even after a failed test. CI should always run `local:down` in an `always()` step.
