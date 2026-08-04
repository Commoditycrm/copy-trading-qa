# Defect Register

A finding becomes a **Confirmed Defect** only after: (1) reproduced **twice**, (2) environment/test-data
causes ruled out, (3) expected behavior verified, (4) redacted evidence captured. See
`docs/DEFECT_MANAGEMENT_PROCESS.md` §7.

## Confirmed defects

| Defect ID | Sev | Title | Confirming test | Reproduced | File |
|---|---|---|---|---|---|
| **DEF-AUTH-001** | High | `auth/refresh` returns 500 (expected 401) on malformed `sub` | TC-AUTH-003-002 | ×3 | [DEF-AUTH-001.md](DEF-AUTH-001.md) |
| **DEF-AUTH-002** | High | Password reset accepts a weaker password than registration | TC-AUTH-004-004 | ×2 + control | [DEF-AUTH-002.md](DEF-AUTH-002.md) |
| **DEF-AUTH-003** | Medium | Mixed-case forgot-password silently no-match (no reset link) | TC-AUTH-004-006 | ×2 + control | [DEF-AUTH-003.md](DEF-AUTH-003.md) |
| **DEF-COPY-001** | High | Transient-retry of a CLOSE mirror resets `is_closing` to false | TC-COPY-003-007 | ×2 | [DEF-COPY-001.md](DEF-COPY-001.md) |
| **DEF-ADMIN-001** | High | `user_role` enum label case drift (regression — fix migration `c4f1a9d3e7b2` missing from `qa-branch`) — every `/api/admin/*` returns 500 for a real admin | TC-ADMIN-001-005 | ×2+ | [DEF-ADMIN-001.md](DEF-ADMIN-001.md) |
| **DEF-UI-001** | Medium | `/brokers` white-screens (client-side exception) when a user holds a broker name not in the frontend `BROKER_META` (e.g. `fake`) — `BrokerAvatar` derefs `meta.name` with no fallback | TC-WF-06-002 | ×2+ | [DEF-UI-001.md](DEF-UI-001.md) |
| **DEF-SEC-001** | Medium | SSE auth JWT carried in the URL query (`/api/events?token=`) is recorded in cleartext in the uvicorn access log — replayable-token-in-logs (runtime confirmation of §24) | SA-007 | ×2 | [DEF-SEC-001.md](DEF-SEC-001.md) |
| **DEF-A11Y-001** | High | Form controls without programmatic labels / accessible names (axe `label`/`select-name`, critical) — /register, /settings (+3 selects), /trade-panel, /admin | A11Y-SCAN | ×2 | [DEF-A11Y-001.md](DEF-A11Y-001.md) |
| **DEF-A11Y-002** | Medium | Insufficient colour contrast (axe `color-contrast`, serious, WCAG 1.4.3 AA) — /terms, /privacy, /brokers, /settings, /trade-panel, /admin | A11Y-SCAN | ×2 | [DEF-A11Y-002.md](DEF-A11Y-002.md) |
| **DEF-A11Y-003** | Medium | Link-in-text (colour-only), prohibited ARIA attr, non-focusable scroll region (axe serious) — /terms, /privacy, /calendar, /performance | A11Y-SCAN | ×2 | [DEF-A11Y-003.md](DEF-A11Y-003.md) |

All are behavior defects (no fix applied — app repo is read-only; QA reports, app team fixes). DEF-AUTH-*/COPY-001
confirm baseline §27 items; **DEF-ADMIN-001** is a migration/ORM enum-case mismatch that renders the entire
admin surface non-functional on a clean deploy (root cause + suggested `RENAME VALUE` fix in the file).

## Test-data / environment findings (harness — NOT app defects)

| Ref | Finding | Resolution |
|---|---|---|
| TD-001 | App `EmailStr` rejects special-use TLDs (`.test`/`.example`/`.invalid`); synthetic `@kopyya.test` emails 422 at registration | Harness now uses `@qa.kopyya.dev` (`QA_EMAIL_DOMAIN`); documented in `docs/TEST_DATA_STRATEGY.md` |
| TD-002 | Per-IP register throttle (15/hr) bled across tests → 429 | Harness sends a unique `X-Forwarded-For` per user to isolate the throttle |
| TD-003 | Email-sink matched tokens by `sub` only → sometimes picked the verify token (wrong type) | Matcher now filters by claim `type` (`reset`/`verify`) |
| TD-004 | `TC-COPY-004-002` (OCO, ~26s heavy mock-broker test) timed out **once** under 8-worker saturation during the a11y-phase regression. Passes **3/3 isolated** + clean full re-run **185/185**. Environmental timing flake, **not** an app defect or a11y regression. | Mitigation if it recurs: pin `--workers` or raise this test's timeout. |

## Known/Potential (other modules — not yet executed)

| Ref | Finding | Confirming test | State |
|---|---|---|---|
| §24 | SSE token carried in URL query (`GET /api/events?token=`). The uvicorn **access-log capture is now runtime-reproduced** (token in cleartext ×2) — the missing evidence is supplied. | TC-NOTIF-001-018 / SA-007 | **Confirmed → DEF-SEC-001** |
| NOTIF-015 | Broker-error content in notifications/SMS is **truncated, not credential-scrubbed** (`copy.rejected` message = raw broker error `[:180]`; no sanitizer). No current path echoes a secret, but a broker that returned a secret in an error string would surface it. | TC-NOTIF-001-015 (manual) | Potential (redaction-by-truncation only; recommend a scrubber) |
| §15.3 | Unauthenticated SnapTrade webhook / poll-amplification | TC-BRK-003-002 | Potential |
| OPT-004 | `GET /api/options/quote?debug=1` attaches a `_debug` dict (adapter class, connection_status, error type/message + up to 1500 chars of stack trace) to the response for any authenticated account owner — internals/stack-trace disclosure. | TC-OPT-001-004 | Potential (owner-only, but a debug flag should not surface a stack trace in prod) |
| §17 | `max_per_contract` accepted/persisted but unenforced | TC-RISK-005-003 | Potential |
| §27 | `is_closing` reset on transient retry (copy engine) | TC-COPY-003-007 | **Confirmed → DEF-COPY-001** (mock-broker reproduced ×2) |
| RISK-002 | Auto-liquidation triggers on **unrealized-profit ≥ limit** (take-profit) but model/schema/API docstrings + manual describe an **equity floor**. Code is internally consistent (`copy.auto_liquidated_take_profit`); the spec/docs are misleading. | TC-RISK-002-002 | Potential (doc/impl mismatch — reproduced ×2; needs product confirmation, not filed as a code defect) |
| RISK-001 | Next-day auto-resume: the **fanout** resume sweep iterates only `copy_enabled=true` subs (`get_subscribers_for_trader`), so it can never re-enable a `copy_enabled=false` auto-paused sub. Resume works via the **poller** (`pnl_poller._enforce_one`). Feature functions; the fanout sweep is effectively redundant/dead for the normal paused state, and TC-RISK-001-009's "on the next fanout" wording is inaccurate. | TC-RISK-001-009 | Observation (reproduced ×2; automated via the poller path) |
| BRK-001 | **Connect eviction commits before verification** — `connect` (`api/brokers.py:644`) calls `_evict_existing_brokers` (deletes the user's existing broker, `db.flush` uncommitted, `:248-271`) BEFORE `verify_connection` (`:662`). On a verify failure the `except` branch `db.commit()`s (`:674`) the pending eviction, while the new account is only `db.add`-ed on success (`:677`). Net: a failed replace would leave the user with **NO broker** (old committed-deleted, new never persisted, listener already stopped). Same pattern in `snaptrade_finish` (`:557`/`:585`). | TC-BRK-001-003 / 001-016 | **Potential (high) — NOT yet runtime-reproduced.** Evidence is code-review only; per policy it stays Potential until reproduced twice at runtime. **Environment needed to confirm:** a controllable Alpaca/SnapTrade adapter that returns a verify FAILURE without outbound (an offline adapter stub or a base-URL-redirected fixture) so the user can hold an existing broker, attempt a replace that fails verify, and observe the old row committed-deleted. Recommend the app team reorder evict-after-verify or wrap in a savepoint. |
| BRK-003 | SnapTrade webhook is **unauthenticated / no signature verification** (`api/brokers.py:282`, explicit "not enforced yet" note). A forged call for a known trader id schedules an extra poll — no fake-trade injection (SnapTrade dedups by broker id), but a **poll-amplification** vector. | TC-BRK-003-002 | Potential (automated — asserts the accepted risk; baseline §15.3) |
| ADMIN-002 | **Admin mutating actions are not audited.** `activate`/`deactivate`/`role`/`business-name` (`api/admin.py`) emit only `log.info` — no `audit_logs` row is written (the only `audit.record` in the admin/service layer is `position.reconciled`). Confirmed at runtime: after a deactivate + role-change, `audit_logs` count for those actions is 0. Governance gap, not a code defect — if admin auditability is required, these mutations should record actor/target/change. | TC-ADMIN-001-003 | Observation (reproduced ×2; automated — asserts the absence) |
| ADMIN-005 | **Doc/brief mismatch on config bound.** The engagement brief cites the Alpaca P&L poll-interval range as 5–300s; the implementation (`services/platform_config.py`) enforces **1–300s** (interval `1` accepted, `0`→422, `400`→422). Not a defect — the app is internally consistent; the brief is stale. Fanout-batch-threshold bound (1–10000) matches. | TC-ADMIN-005-002 | Observation (impl 1–300, not 5–300; automated to the impl bound) |
| SA-005 | **No application-layer web-security headers.** The FastAPI app sets only CORS (correctly allowlisted, no wildcard/credentials-reflection); it emits no CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy, and the frontend leaks `X-Powered-By: Next.js`. In prod these are expected at the Caddy edge (`docker-compose.override.yml`/`Caddyfile` — NOT in the repo, so unverifiable). Recommend confirming/enforcing at the edge and setting `poweredByHeader:false`. | SA-005 | Potential (edge-dependent — cannot confirm prod from repo) |

## Security scan findings (SA phase — dependency / container / config hygiene)

Scanners: npm audit, Trivy (image + python pkgs, pip-audit substitute), gitleaks, Schemathesis, OWASP ZAP baseline. Run against the disposable local stack + read-only repos only. App repo READ-ONLY — reported for the app team, not fixed here.

| Ref | Finding | Tool | State |
|---|---|---|---|
| SEC-DEP-001 | **Backend Python deps carry known CVEs.** `python-jose 3.3.0` (CRITICAL CVE-2024-33663, JWT algorithm-confusion — auth-relevant), `python-multipart 0.0.12` (multiple HIGH DoS), `starlette 0.38.6` (HIGH), `cryptography 43.0.3` (HIGH — used for Fernet credential encryption), plus pillow/ecdsa/pyasn1/aiohttp/wheel. | Trivy image (python pkgs) | Potential (upgrade deps; jose→3.4.0, multipart→0.0.30+, starlette→0.40+, cryptography→46+) |
| SEC-DEP-002 | **Frontend npm deps:** 2 high + 1 critical — `postcss` (transitive via next: XSS/path-traversal in source-map handling) and `sharp <0.35.0` (libvips CVEs). Fix requires `next@15.5.22`. | npm audit | Potential |
| SEC-DEP-003 | **Base-image OS CVEs.** backend image 119 HIGH + 19 CRITICAL (Debian: libperl5.40, util-linux, gzip…); frontend 41 HIGH + 3 CRITICAL (node:20-alpine). Base-image hygiene — rebase to patched bases + periodic rebuilds. | Trivy image (OS) | Potential |
| SEC-DEP-004 | **QA automation deps:** 2 moderate (`exceljs`→`uuid`). QA tooling only. | npm audit | Observation |
| SEC-CFG-001 | **Container hardening:** non-root confirmed (backend/worker=`appuser`, frontend=`node`); Postgres/Redis internal-only (no host ports); Redis `requirepass`. Prod compose enforces `read_only:true` + `cap_drop:ALL` + `no-new-privileges` (via anchor); the QA harness omits these for test convenience. | docker inspect / compose | Pass (prod hardened) |
| SEC-SECRET-001 | **gitleaks: 0 committed secrets** in either repo. All hits are vendored (`node_modules`/`.venv`/site-packages) or **gitignored, untracked** local env (`qa.env`, `backend/.env`) and a gitignored runtime log. | gitleaks | Pass (no committed secrets) |
| SEC-API-001 | **Schemathesis:** 102/110 operations enforce auth (401/403 unauthenticated); no unauthenticated 5xx. The 119 "failures" are OpenAPI documentation mismatches (undocumented 401/403/422 response codes) — spec-completeness, not security. Deeper authenticated/stateful fuzz not run (gap). | Schemathesis | Pass + doc-gap |
| SEC-ZAP-001 | **OWASP ZAP baseline** (passive, localhost only): API root has no crawlable surface (JSON API, root 404). Frontend passive scan flags missing security headers (corroborates SA-005). 0 FAIL. | ZAP baseline | See SA-005 |
