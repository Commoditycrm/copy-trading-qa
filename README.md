# copy-trading-qa

Quality-assurance repository for the **Copy Trading Platform ("Kopyya")**. This repo holds all QA
documentation, manual test cases, automation code, fixtures, configuration, reports, and CI
workflows for the application that lives in the **separate** repository `copy-trading-app`.

> **The application repository (`D:\Workspace\copy-trading-app`) is READ-ONLY.**
> Nothing in this QA repo may create, modify, delete, rename, or move any file in the app repo.
> All QA artifacts are created here, in `copy-trading-qa`, only.

## Source of truth

The approved functionality baseline is [`docs/PROJECT_FUNCTIONALITY_DOCUMENT.pdf`](docs/PROJECT_FUNCTIONALITY_DOCUMENT.pdf)
(Markdown source alongside it). Every test artifact traces back to a **Functionality ID** from that
document. See [`docs/TRACEABILITY_MATRIX.md`](docs/TRACEABILITY_MATRIX.md).

## Golden safety rules (non-negotiable)

1. Never copy production secrets into this repository.
2. Never use real customer or brokerage data.
3. Never place live brokerage orders.
4. Do not connect to production brokers during normal automated testing.
5. Use **mock/fake broker accounts** for any destructive test.
6. Production tests are **read-only** unless separately approved in writing.

## Governance documents (`docs/`)

| Doc | Purpose |
|---|---|
| `PROJECT_FUNCTIONALITY_DOCUMENT.pdf` | Approved functionality baseline (source of truth). |
| `VERIFICATION_NOTES.md` | Baseline-vs-implementation verification + contradictions found. |
| `TEST_STRATEGY.md` | Scope, levels, types, tools, risk-based approach, entry/exit criteria. |
| `TEST_PLAN.md` | What/when/how per release; suites, schedules, roles, milestones. |
| `TEST_CASE_STANDARD.md` | Test-case format, ID scheme, naming, tags, severity/priority, evidence. |
| `TRACEABILITY_MATRIX.md` | Functionality ID → Test Case ID mapping and coverage tracking. |
| `TEST_DATA_STRATEGY.md` | Data provisioning, fake brokers, factories, isolation, cleanup. |
| `ENVIRONMENT_GUIDE.md` | Environments, how to stand up a local QA stack, endpoints, access. |
| `DEFECT_MANAGEMENT_PROCESS.md` | Defect lifecycle, severity/priority, SLAs, reporting. |

## Repository layout

```
copy-trading-qa/
├─ docs/            # governance docs + baseline
├─ manual/          # manual test cases (by module), exploratory charters, checklists
├─ automation/      # api · ui · integration · security · accessibility · performance · smoke · common
├─ fixtures/        # data, factories, mocks (no real data / no secrets)
├─ config/          # environment config (.env.example only — never real secrets)
├─ reports/         # generated evidence (gitignored)
├─ .github/workflows/  # CI pipelines
└─ tools/           # helper scripts (token minting, seeding via app admin API, etc.)
```

## Status

**Phase:** QA strategy & structure established. **Test cases are NOT yet authored** — pending
approval of the strategy and structure documents in `docs/`. No packages are installed yet; the
proposed dependency list awaits approval (see `TEST_STRATEGY.md` §Tooling).
