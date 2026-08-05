# Automation

Automated suites. **No test code authored yet** — framework and tests are added after tooling approval
(`docs/TEST_STRATEGY.md` §9). Layout by discipline:

**Language split (FINAL):** **TypeScript + Playwright** is the primary stack — **UI E2E** _and_
**API black-box** (via `APIRequestContext`), plus `smoke`, `common`, and `accessibility`
(`@axe-core/playwright`). **Python** is confined to `contract/` (Schemathesis OpenAPI fuzz) and any rare
backend-specific integration test. **k6** (JS) for `performance`.

```
automation/
├─ package.json · package-lock.json · tsconfig.json · playwright.config.ts · .prettierrc.json
├─ common/        # TS — config, env detection, SAFETY GUARDS (prod write-block, fake-broker,
│                 #   paper-suite, prod-safe), redaction, JWT minting, SafeApi wrapper, global-setup, tags
├─ api/           # TS — L2 API black-box (Playwright APIRequestContext)
│  ├─ tests/      #   test_tc_<funcid>_<seq>_<slug>.spec.ts
│  └─ clients/    #   thin typed API clients built on common/api.ts
├─ ui/            # TS — L4 E2E (@playwright/test)
│  ├─ tests/      #   tc-<funcid>-<seq>-<slug>.spec.ts (journeys per role)
│  ├─ pages/      #   page objects (.ts)
│  └─ fixtures/   #   UI fixtures (auth state, seeded data handles)
├─ smoke/         # TS — shallow critical-path; @prod-safe subset for production
├─ accessibility/ # TS — @axe-core/playwright hooked into UI journeys
├─ contract/      # PYTHON (3.12 venv) — Schemathesis OpenAPI contract/fuzz (requirements.txt)
├─ integration/   # PYTHON (rare) — backend-specific integration only where TS can't reach
├─ security/      # ZAP (DAST) config + authZ-bypass (TS) + dep/secret scan wiring; SA-### assessments
└─ performance/   # k6 (JS) — PERF-<FUNCID>-### fanout latency/load with fake subscribers
```

**Bootstrap (post-approval):** `cd automation && npm ci && npx playwright install --with-deps chromium`.
Python: `cd automation/contract && python3.12 -m venv .venv && pip install -r requirements.txt`.

**Safety guards live in `common/`:** an env allow-list guard (block writes/destructive against prod),
a broker-mode assertion (`fake` for destructive tests), and evidence redaction helpers.

## Test IDs in automation (finalized — see `docs/TEST_CASE_STANDARD.md`)

- Automated tests reuse the **same** permanent `TC-<FUNCTIONALITY-ID>-<3-digit>` ID as their manual
  counterpart. **There are no `AUTO-*` IDs.**
- **Filename embeds the ID.**
  - **Python (API/integration/smoke):** `test_tc_<funcid-lower-underscored>_<seq>_<slug>.py`
    → `automation/api/tests/auth/test_tc_auth_001_001_valid_login.py`
  - **TypeScript (UI):** `tc-<funcid-lower>-<seq>-<slug>.spec.ts`
    → `automation/ui/tests/workflows/tc-wf-10-001-place-order-fanout.spec.ts`
- **Test name carries the ID:** pytest `def test_tc_auth_001_002_duplicate_email_returns_409(...)`;
  Playwright `test('TC-AUTH-001-001 register valid trader', ...)`.
- **Allure labels:** `@allure.testcase("TC-AUTH-001-002")` / `allure.label('func_id','AUTH-001')` (TS).
- Performance scenarios use `PERF-<FUNCID>-<3-digit>` filenames under `automation/performance/`;
  independent security assessments use `SA-<3-digit>` under `automation/security/`.
- The ID is permanent; automating a manual case only changes its `automation_status`/`automation_ref`
  metadata — never the ID.
