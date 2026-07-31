# CI workflows (planned)

Actual GitHub Actions YAML is added **after** tooling approval (`docs/TEST_STRATEGY.md` §9) so pipelines
don't reference not-yet-approved dependencies. The execution model is defined in
`docs/TEST_PLAN.md` §4. Planned workflows:

| File (planned) | Trigger | Suites |
|---|---|---|
| `pr.yml` | pull_request | lint · gitleaks · pip-audit · `@smoke` · `api-fast` · Schemathesis(quick) · `@a11y`(changed) — **blocking**, ≤10 min |
| `qa-deploy.yml` | QA env deploy / `repository_dispatch` from app repo | `@smoke` · `api-full` · `integration` · `e2e-ui` · `@a11y` · ZAP baseline — blocking |
| `nightly.yml` | schedule (cron) | full regression · `performance` · ZAP full · Trivy · dep audit — alerts |
| `release-candidate.yml` | tag / release branch | full regression · perf at scale · ZAP full · coverage gate — blocking |
| `broker-contract.yml` | **manual** `workflow_dispatch` | `broker-contract` (`@paper`) — Alpaca **Paper** contract validation only; DevOps-owned creds; never automatic |
| `prod-smoke.yml` | post-deploy on app `main` (dispatch) | `prod-smoke` **read-only** — blocking rollback signal; creds + ZAP auth **owned by DevOps/security lead** |

All triggers target a **fake-broker** environment except: `broker-contract.yml` (manual, Alpaca **Paper**
only) and `prod-smoke` (**read-only** against production). Destructive (`@destructive`) tests are
tag-excluded everywhere except local/QA with fake broker.

**Toolchains:** UI (`e2e-ui`, `accessibility`) run on **Node/TypeScript (@playwright/test)**;
API/integration/contract/smoke run on **Python (pytest)**; performance runs on **k6**.
