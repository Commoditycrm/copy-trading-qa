# Manual testing

Manual test cases, exploratory charters, and checklists. **No cases authored yet** — pending strategy
approval. Follow `docs/TEST_CASE_STANDARD.md` for the file format, ID scheme, metadata, tags, evidence.

```
manual/
├─ test-cases/<module>/   # Markdown cases with YAML front-matter, one Func ID area per folder
├─ exploratory/           # EC-<MODULE>-### time-boxed charters (mission, areas, findings)
└─ checklists/            # CL-<MODULE>-### release/security/a11y/prod-smoke checklists
```

## Identification (finalized — see `docs/TEST_CASE_STANDARD.md`)

- **Test case ID:** `TC-<FUNCTIONALITY-ID>-<3-digit-sequence>` (e.g. `TC-AUTH-001-001`, `TC-WF-10-001`).
- IDs are **permanent, never reused**; retired cases keep their ID with `status: Retired`.
- **No** type/status/env/automation inside the ID — those are **metadata fields** in the front-matter.
- Every case has a **Primary Functionality ID** (approved baseline ID) and optional **Related
  Functionality IDs**.
- **Manual and automated share one ID** (no `AUTO-*`). Each case carries the full 23-field metadata
  schema from the standard.
- Exploratory charters: `EC-<MODULE>-###`. Checklists: `CL-<MODULE>-###`.

Module folders mirror the baseline Functionality-ID prefixes (auth, authz, brokers, trading,
copy-engine, risk-controls, follow, subscribers, positions, history, pnl, notifications, sms, admin,
options, background, integrations, security, performance, smoke).
