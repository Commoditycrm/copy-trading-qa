# Contract & fuzz testing (Python — Schemathesis)

Schemathesis property-tests the backend against its live OpenAPI schema (`/openapi.json`) — status-code
conformance, schema validation, and 500-hunting (e.g. the documented `auth/refresh` 500). This is the
**only** primary Python surface; all other API tests are TypeScript (Playwright `APIRequestContext`).

**Runtime:** Python **3.12** venv (not the host 3.14 — see `docs/DEPENDENCY_VERIFICATION_REPORT.md` §5.4).

```
python3.12 -m venv .venv
. .venv/Scripts/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip-audit                       # must be clean before use
# example (target a fake-broker QA stack, never prod):
schemathesis run $QA_BASE_URL/openapi.json --checks all
```

**Safety:** contract runs target the fake-broker QA stack only. Never run write-heavy fuzzing against
production. No real credentials; use a QA-only token if authenticated fuzzing is needed.
