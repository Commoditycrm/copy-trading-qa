# QA CI/CD — GitHub Actions

Production-quality workflows that run the approved QA suites safely. **The application repository is never
modified** — it is checked out READ-ONLY (`ref: qa-branch`) only as a Docker build context for the
disposable local stack.

## Workflows

| File                  | Trigger                                      | What it runs                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr.yml`              | `pull_request` → `main`, `workflow_dispatch` | **QA / Typecheck** (tsc + prettier), **QA / Security Scan** (npm audit + gitleaks), **QA / PR Smoke** (auth + trading-P0 + risk-P0 + broker offline, fake broker), **QA / UI Smoke** (UI + a11y public scans). ~10-15 min, jobs parallel. |
| `qa-regression.yml`   | `workflow_dispatch` (gated env)              | Full API + UI E2E + accessibility + Schemathesis (unauth) + ZAP baseline (authorized input only).                                                                                                                                         |
| `nightly.yml`         | `schedule` 04:00 UTC, `workflow_dispatch`    | Full API + UI + a11y + security Playwright + Trivy fs/image + gitleaks + npm audit + pip-audit + a limited local-safe perf baseline. No stress/soak.                                                                                      |
| `performance.yml`     | `workflow_dispatch` only                     | k6 + Playwright perf (load-level / subscriber-count / duration inputs). Refuses production URLs. Sanitized summaries only.                                                                                                                |
| `broker-contract.yml` | `workflow_dispatch` only                     | `fake` (default, safe) or `paper` (gated `alpaca-paper` environment, `RUN-PAPER` confirm). Never IBKR / live money.                                                                                                                       |
| `prod-smoke.yml`      | `workflow_dispatch` (gated env)              | **BLOCKED** until DevOps provides account + written authorization + secrets. Read-only `@prod-safe` only.                                                                                                                                 |
| `app-push.yml`        | `repository_dispatch` (app-push), `workflow_dispatch` | **Auto-runs on every push to the app repo's `qa-branch`** (the team's active branch; `main` later). Checks out the app repo at the pushed SHA (READ-ONLY) and runs the full API (trading serial) + UI E2E + accessibility regression on the disposable fake-broker stack. Posts a best-effort commit status back to the app commit. See "Auto-run on app push" below. |
| `qa-push.yml`         | `push` (any branch), `workflow_dispatch`     | **Auto-runs on every push to THIS (QA) repo** — validates test-case changes immediately. Typecheck → full API (trading serial) + UI E2E + accessibility on the disposable fake-broker stack. Needs `APP_REPO_TOKEN`. Concurrency-cancels superseded pushes on the same branch. |
| `qa-smoke.yml`        | `schedule` (every 6h), `workflow_dispatch`   | **Read-only smoke against the DEPLOYED QA** (`test.kopyya.com`) — health, public pages, auth-required 401s, no schema leak, SA-005 header observation. HTTP-only, no local stack, no broker, no writes. Target override: repo variable `QA_SMOKE_BASE_URL`. No `APP_REPO_TOKEN` needed. |
| `notify-failure.yml`  | `workflow_run` (on the 3 pipelines above, `completed`) | **Alerts on any QA-pipeline failure.** Posts a run link to Discord (if `DISCORD_WEBHOOK` set) or Slack (if `SLACK_WEBHOOK` set); no-ops until one is configured. GitHub also emails the run author by default. |

## Safety controls (every workflow)

- **Teardown** with `if: always()` (`npm run local:down` → `docker compose down -v`).
- **Destructive/stack jobs run only** with `QA_ENV=local` + `BROKER_MODE=fake`; runtime `common/safety.ts`
  refuses mutations on prod and destructive tests without a fake broker.
- **Production hostname is refused** everywhere except `prod-smoke.yml` (read-only, gated, authorized input).
- **No secrets are printed**; QA stack secrets are generated at runtime by `local-stack/up.mjs` (nothing
  committed). `qa.env` / `.env` are gitignored.
- **Redacted artifacts only**: JUnit, Playwright HTML, failure traces/screenshots, scanner summaries.
- **Concurrency groups** cancel superseded branch runs (`cancel-in-progress: true` on PR/perf).
- **Explicit `timeout-minutes`** on every job.
- **npm + Playwright-browser caching** (`actions/setup-node` cache + `actions/cache`).
- **Actions pinned by commit SHA** (`checkout`/`setup-node`/`upload-artifact`/`cache`). Scanners run via
  Docker images (gitleaks/trivy/schemathesis/zap/k6); pin these to digests for full reproducibility (follow-up).
- **No `pull_request_target`** — untrusted PR code never runs with secrets. Fork PRs get the static checks
  only (stack jobs need `APP_REPO_TOKEN`, unavailable to forks).

## Required secrets & owners

| Secret                                    | Scope                          | Owner                  | Purpose                                                                                                                                               |
| ----------------------------------------- | ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_REPO_TOKEN`                          | repo / org                     | DevOps                 | **Read-only** token (fine-grained PAT or deploy key) to check out `Commoditycrm/copy-trading-app` as a build context. Read-only; never used to write. |
| `ALPACA_PAPER_KEY`, `ALPACA_PAPER_SECRET` | `alpaca-paper` environment     | DevOps                 | Alpaca **Paper** creds for `broker-contract.yml` paper mode. No live money.                                                                           |
| `PROD_BASE_URL`, `PROD_SMOKE_TOKEN`       | `production-smoke` environment | DevOps / Security lead | Read-only prod smoke target + token. **Not yet provisioned** — `prod-smoke.yml` stays blocked until issued.                                           |

| `QA_DISPATCH_TOKEN` (in the **app** repo) | app repo secret | DevOps | Lets the application repo notify this QA repo on push to `main` (sends a `repository_dispatch`). Fine-grained PAT scoped to `Commoditycrm/copy-trading-qa` with **Contents: Read and write**, a classic PAT with `repo`, or a GitHub App token. |

Environments requiring **reviewer approval**: `qa-regression`, `alpaca-paper`, `production-smoke`.
(`app-push.yml` is intentionally **not** behind a gated environment — a manual approval per push would defeat auto-run. Its safety comes from the disposable local + fake-broker stack, same as the other stack jobs.)

## Auto-run QA on every app push (`app-push.yml`)

Runs the QA regression automatically whenever a teammate pushes to the **application** repo's `qa-branch` (the team's active branch — switch to `main` later by editing one line), testing the exact commit.

1. **App repo (one-time):** copy `.github/app-repo-snippet/notify-qa.yml` into the application repo at
   `.github/workflows/notify-qa.yml`, and add the `QA_DISPATCH_TOKEN` secret there (above). On every push to
   app `qa-branch` it sends a `repository_dispatch` (`app-push`, carrying the commit SHA) to this repo.
2. **QA repo:** `app-push.yml` listens for that event, checks out the app repo at the pushed SHA (needs
   `APP_REPO_TOKEN`), runs API + `@trading` serial + UI + a11y, and (best-effort) posts a `QA / On App Push`
   commit status back onto the app commit so the result shows up on the app side.
3. **Manual test:** run `app-push.yml` via *workflow_dispatch* with a `sha` input to verify wiring before the
   app-repo notifier is added.

Prereqs: `APP_REPO_TOKEN` (this repo) must be provisioned — it is still the outstanding DevOps item that also
gates `qa-regression`/`nightly`. For the commit-status-back step, `APP_REPO_TOKEN` needs `statuses: write` on
the app repo (otherwise that step no-ops harmlessly).

## Artifact retention

PR smoke/UI 7 days · regression/nightly/perf 14 days · prod-smoke 30 days. Failure traces uploaded only on
failure; reports always.

## Expected durations

Typecheck/Security ~1-3 min · PR Smoke ~10-14 min · UI Smoke ~10-13 min (PR wall-clock ~13-15 min) ·
Regression ~35-50 min · Nightly ~60-80 min · Performance 15-40 min (by level) · Broker-contract (fake) ~15-20 min.

## TD-004 — OCO timeout resolution

`TC-COPY-004-002` (OCO, ~26s, heavy mock-broker) times out intermittently under CPU contention. Investigation
(full API suite, `complete suite context`):

- **1 worker (isolated / serial):** passes every time.
- **4 workers (intended CI count), 5× consecutive:** **4/5 passed** — flaked once → **resource contention
  confirmed** at the CI worker count.
- (Locally at 8 workers it flaked ~1 in 3.)

**Resolution** (no retries, no skip, still blocking, runs once per regression): the `@trading` group runs
**serially (`--workers=1`)** in `qa-regression.yml` and `nightly.yml`; everything else runs parallel at
`--workers=4`. The heavy trading tests therefore never contend for CPU. The PR **Trading P0 smoke** already
excludes the two heaviest (`TC-COPY-004-002`, `TC-COPY-002-013`) — the full regression covers them serially.

## Recommended branch-protection required checks (documentation only — not applied automatically)

On `main`, require these status checks (job names):

- `QA / Typecheck`
- `QA / PR Smoke`
- `QA / Security Scan`
- `QA / UI Smoke`

Plus: require branches up to date, require PR review, dismiss stale approvals. **Do not** make
`qa-regression` / `nightly` / `performance` / `broker-contract` / `prod-smoke` required PR checks — they are
manual/scheduled/gated. Applying branch protection is left to a repo admin (not changed by CI).
