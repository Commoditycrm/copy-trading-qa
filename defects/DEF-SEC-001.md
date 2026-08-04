# DEF-SEC-001 — SSE auth JWT is exposed in the URL query string and logged in cleartext

- **Severity:** Medium · **Priority:** P2 · **Status:** Confirmed (reproduced ×2, both security-suite runs) · **Date:** 2026-08-04
- **Module:** notifications / auth · **Functionality ID:** NOTIF-001 (baseline §24) · **Confirming test:** `SA-007`
- **Environment:** local-qa disposable stack · **Build:** app repo `qa-branch`
- **Source:** `GET /api/events?token=<JWT>` (SSE stream; EventSource cannot set an `Authorization` header, so the access token is passed as a query parameter), served by uvicorn whose access log records the full request line.

## Summary
The Server-Sent-Events stream authenticates by putting the bearer **access token in the URL query string**
(`/api/events?token=eyJ…`). Because the browser `EventSource` API cannot attach an `Authorization` header,
this is the transport the frontend uses. uvicorn's access log logs the complete request line including the
query string, so **the JWT is written to the backend access log in cleartext** on every SSE connection. Any
party with access to server logs (ops, centralized logging, a log leak/backup) obtains a **replayable access
token** for the remainder of its ~30-minute TTL. Tokens in URLs are also exposed to proxies, browser history,
and `Referer` headers. (OWASP: sensitive data in logs / session token in URL.)

## Reproduction (deterministic)
1. Register a subscriber; obtain a valid access token.
2. Open the SSE stream: `GET /api/events?token=<access>` (open briefly, then close).
3. Read the backend container access log.

## Expected vs Actual
- **Expected:** the auth credential is not recorded in server logs (e.g. token passed out-of-band, short-lived
  one-time SSE ticket, or a POST/cookie handshake; and/or access-log query-string scrubbing).
- **Actual:** the access log contains `GET /api/events?token=eyJ…<full JWT>` — the token in cleartext.

## Evidence (redacted)
```
QA backend access log: "GET /api/events?token=eyJhbGciO…[redacted] HTTP/1.1"   (67 occurrences this session)
SA-007 asserts the token's signature tail appears in `docker compose logs backend` after one SSE open.
```
Reproduced 2/2 across both security-suite runs. Independently observed in the app's own local
`backend/uvicorn.out.log` (120 occurrences), confirming it is not a QA-harness artifact. This is the
uvicorn-access-log capture that baseline §24 previously lacked — the finding moves Potential → **Confirmed**.

## Impact
A leaked/over-shared access token is replayable until expiry. Logs are commonly retained, shipped to
third-party aggregators, and more widely readable than the app DB, widening the exposure surface for what is
a live authentication credential.

## Suggested fix (app team)
Stop carrying the token in the query string: issue a short-lived single-use SSE ticket exchanged out-of-band,
authenticate the stream via cookie, or use a fetch-based `EventSource` polyfill that sends an `Authorization`
header. At minimum, scrub `token=` from access-log query strings and shorten SSE-token lifetime. The
confirming test flips to asserting the token is **absent** from logs once fixed.
