# DISCORD — Discord Alerts (ingestion -> order placement)

Manual test cases for the Discord trade-alerts pipeline. Imported from the feature guide **Kopyya Discord
Alerts Test Plan** (artifact `DizfMPE5Cam1irSxCRoRJy`) and grounded against the application branch
`discord-webhook` @ `af853ce` (verified 2026-09-16). Guide IDs are preserved verbatim (e.g. guide `DA-PARSE-04`).

**Pipeline:** DOM listener -> Redis stream `discord:messages:incoming` -> ingest -> parse -> decision ->
sizing -> execute -> trailing-stop guard.

**Surfaces:** `/discord`, the Discord tab of `/trades`, and `/api/discord-sources`.

**Environment:** deployed **QA** (`https://test.kopyya.com`) or local dev with the listener stack. Requires a
Discord account + a channel it can post in, a Kopyya trader with a connected broker (**paper** unless the case
says otherwise), backend with `DISCORD_LISTENER_ENABLED=1` + a `DISCORD_LISTENER_TOKEN`, the listener container
running, and Redis reachable. 'Today' is the US/Eastern trading day.

**Execution mode is account-wide.** Check it at the start of every session: an account left at
`execution_mode=auto` + `live_trading=true` places a REAL order per posted alert with no review step. Reset to
`manual` + paper before exploratory testing. Paper account only — never a live-funded broker.

**Automation:** most cases are manual — they need a real Discord account + channel, a connected broker, live
quotes and the listener container, which the disposable mock-broker stack does not provide. The **API / authZ /
validation** subset that needs neither the listener nor a broker IS automated in
`automation/api/tests/discord/discord-access.spec.ts` (DA-CONN-04/05/06/07/11, DA-SEC-01/05/06, DA-SIZE-10/11,
DA-TRAIL-11 — 11 cases, run on the disposable stack via the `docker-compose.discord.yml` overlay + the grey-box
`enableDiscord` helper). Parser and execution behaviour (areas 04, 07, 08) additionally carry backend unit
coverage on the app branch (`backend/tests/test_discord_*.py` — 258 pass / 2 stale-fail as of 2026-09-16).

**Verified notes:** where a `**Verified**` line appears, the guide's expectation was checked against the code on
`discord-webhook` @ `af853ce`; a note flags any wording to correct before running or an app-side defect to report.

## Functional areas

- **DA-CONN** (01) — Connection & session (18 cases)
- **DA-HIST** (02) — History suppression (7 cases)
- **DA-SCHED** (03) — Schedule windows (9 cases)
- **DA-PARSE** (04) — Parser matrix (34 cases)
- **DA-MODE** (05) — Approval mode (9 cases)
- **DA-SIZE** (06) — Sizing (12 cases)
- **DA-EXEC** (07) — Execution (14 cases)
- **DA-TRAIL** (08) — Trailing-stop guard (11 cases)
- **DA-UI** (09) — Order history UI (10 cases)
- **DA-SEC** (10) — Security (8 cases)
- **DA-REG** (11) — Regression — existing behaviour (6 cases)

---

## 01 — Connection & session

```yaml
id: DA-CONN-01
title: Add channel by full URL
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-01]
evidence_requirements: [Source created with status `needs_login`; guild + channel IDs parsed correctly.]
```
**Steps:** Add a channel with a full URL https://discord.com/channels/<guild>/<chan>.
**Expected Results:** Source created with status `needs_login`; guild + channel IDs parsed correctly.

---

```yaml
id: DA-CONN-02
title: URL with trailing slash / query
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-02]
evidence_requirements: [Parsed identically to DA-CONN-01 (the URL matcher is not end-anchored).]
```
**Steps:** Add a channel URL with a trailing slash or a query string.
**Expected Results:** Parsed identically to DA-CONN-01 (the URL matcher is not end-anchored).

---

```yaml
id: DA-CONN-03
title: DM channel URL
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-03]
evidence_requirements: [Defined behaviour, never a 500.]
```
**Steps:** Add a DM channel URL (/channels/@me/<id>).
**Expected Results:** Defined behaviour, never a 500.
**Verified (discord-webhook af853ce):** Accepted: creates a `needs_login` source with guild_id=None.

---

```yaml
id: DA-CONN-04
title: Non-Discord URL
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-04]
evidence_requirements: [400 with a readable error (`invalid_channel_url: ...`); no row created.]
```
**Steps:** Add a non-Discord URL, e.g. https://example.com/x.
**Expected Results:** 400 with a readable error (`invalid_channel_url: ...`); no row created.

---

```yaml
id: DA-CONN-05
title: Empty / whitespace URL
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-05]
evidence_requirements: [Rejected; no row created.]
```
**Steps:** Add an empty or whitespace-only URL.
**Expected Results:** Rejected; no row created.
**Verified (discord-webhook af853ce):** Empty/short (<10 chars) is a Pydantic 422 (min_length=10), NOT 400; only whitespace of >=10 chars reaches the 400 path.

---

```yaml
id: DA-CONN-06
title: Same channel twice (one trader)
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-06]
evidence_requirements: [Rejected by UNIQUE (user_id, channel_id); clean message, not a raw DB error.]
```
**Steps:** Add the same channel twice for one trader.
**Expected Results:** Rejected by UNIQUE (user_id, channel_id); clean message, not a raw DB error.
**Verified (discord-webhook af853ce):** 409 with code `channel_already_connected` (constraint uq_discord_source_user_channel).

---

```yaml
id: DA-CONN-07
title: Same channel, two traders
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-07]
evidence_requirements: [Both succeed — the constraint is per user.]
```
**Steps:** Two different traders each add the same channel.
**Expected Results:** Both succeed — the constraint is per user.

---

```yaml
id: DA-CONN-08
title: Display name on add
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-08]
evidence_requirements: [That name — not the Discord channel name — appears in Order History (source_label = src.label).]
```
**Steps:** Give the source a display name on add.
**Expected Results:** That name — not the Discord channel name — appears in Order History (source_label = src.label).

---

```yaml
id: DA-CONN-09
title: Rename a source
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-09]
evidence_requirements: [Order History label updates for new AND existing rows (label read live at query time, not copied onto rows).]
```
**Steps:** Rename a source after creation.
**Expected Results:** Order History label updates for new AND existing rows (label read live at query time, not copied onto rows).

---

```yaml
id: DA-CONN-10
title: Connect via connector
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-10]
evidence_requirements: [Session captured; status moves needs_login -> connecting -> connected.]
```
**Steps:** Run Connect Discord and complete pairing via the connector.
**Expected Results:** Session captured; status moves needs_login -> connecting -> connected.

---

```yaml
id: DA-CONN-11
title: Claim non-existent pairing code
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-11]
evidence_requirements: [404 (`invalid_or_expired_code`); no session written.]
```
**Steps:** Claim a pairing code that does not exist.
**Expected Results:** 404 (`invalid_or_expired_code`); no session written.

---

```yaml
id: DA-CONN-12
title: Claim pairing code twice
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-12]
evidence_requirements: [Second claim rejected — codes are single-use.]
```
**Steps:** Claim a pairing code twice.
**Expected Results:** Second claim rejected — codes are single-use.

---

```yaml
id: DA-CONN-13
title: Expired pairing code
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-13]
evidence_requirements: [Rejected.]
```
**Steps:** Let a pairing code expire, then claim it.
**Expected Results:** Rejected.
**Verified (discord-webhook af853ce):** Returns the generic `invalid_or_expired_code` (Redis TTL 600s) — no 'expired'-specific message by design.

---

```yaml
id: DA-CONN-14
title: Add 2nd channel while connected
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-14]
evidence_requirements: [No login prompt. New source inherits the account session and reaches `connected`.]
```
**Steps:** Add a 2nd channel while the account is already connected.
**Expected Results:** No login prompt. New source inherits the account session and reaches `connected`.

---

```yaml
id: DA-CONN-15
title: Add 3rd/4th/5th channel
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-15]
evidence_requirements: [All connect; all receive messages concurrently and independently.]
```
**Steps:** Add a 3rd, 4th, 5th channel.
**Expected Results:** All connect; all receive messages concurrently and independently.

---

```yaml
id: DA-CONN-16
title: Channel account cannot access
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-16]
evidence_requirements: [Status `error` with a readable reason; no attempt to work around the permission.]
```
**Steps:** Connect a channel the Discord account cannot access.
**Expected Results:** Status `error` with a readable reason; no attempt to work around the permission.
**Verified (discord-webhook af853ce):** Access detection happens in the discord-listener container; the backend records last_error via /internal/status.

---

```yaml
id: DA-CONN-17
title: Sign out
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-17]
evidence_requirements: [All sources on that account drop to `needs_login`; stored session cleared.]
```
**Steps:** Sign out (DELETE /{id}/session).
**Expected Results:** All sources on that account drop to `needs_login`; stored session cleared.

---

```yaml
id: DA-CONN-18
title: Delete source with history
primary_func_id: DA-CONN
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, conn, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Connection & session DA-CONN-18]
evidence_requirements: [Source removed; historical orders remain in Order History and are not orphaned.]
```
**Steps:** Delete a source that has messages and orders.
**Expected Results:** Source removed; historical orders remain in Order History and are not orphaned.
**Verified (discord-webhook af853ce):** Message rows cascade-delete with the source (ondelete=CASCADE); Order rows survive (order_id is SET NULL).

---

## 02 — History suppression

```yaml
id: DA-HIST-01
title: Connect channel with backlog
primary_func_id: DA-HIST
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, hist, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), History suppression DA-HIST-01]
evidence_requirements: [Zero messages ingested; Order History shows nothing new.]
```
**Steps:** Connect a channel with 100+ existing messages, several of them valid alerts.
**Expected Results:** Zero messages ingested; Order History shows nothing new.

---

```yaml
id: DA-HIST-02
title: One new alert after connect
primary_func_id: DA-HIST
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, hist, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), History suppression DA-HIST-02]
evidence_requirements: [Exactly that one is ingested.]
```
**Steps:** Post one new alert after connecting.
**Expected Results:** Exactly that one is ingested.

---

```yaml
id: DA-HIST-03
title: Listener restart then post
primary_func_id: DA-HIST
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, hist, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), History suppression DA-HIST-03]
evidence_requirements: [Only the new alert ingests — reconnect does not replay the gap as history.]
```
**Steps:** Restart the listener container, then post an alert.
**Expected Results:** Only the new alert ingests — reconnect does not replay the gap as history.

---

```yaml
id: DA-HIST-04
title: Scroll far up
primary_func_id: DA-HIST
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, hist, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), History suppression DA-HIST-04]
evidence_requirements: [Scrollback renders but ingests nothing.]
```
**Steps:** Scroll the channel far up in the watched browser session.
**Expected Results:** Scrollback renders but ingests nothing.

---

```yaml
id: DA-HIST-05
title: Disconnect, post, reconnect
primary_func_id: DA-HIST
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, hist, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), History suppression DA-HIST-05]
evidence_requirements: [Messages sent while disconnected are NOT back-filled.]
```
**Steps:** Disconnect, wait, post 3 alerts, reconnect.
**Expected Results:** Messages sent while disconnected are NOT back-filled.

---

```yaml
id: DA-HIST-06
title: Delete + re-add channel
primary_func_id: DA-HIST
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, hist, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), History suppression DA-HIST-06]
evidence_requirements: [A fresh baseline is taken; prior messages are not re-ingested.]
```
**Steps:** Delete a source and re-add the same channel.
**Expected Results:** A fresh baseline is taken; prior messages are not re-ingested.

---

```yaml
id: DA-HIST-07
title: Edit a pre-baseline message
primary_func_id: DA-HIST
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, hist, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), History suppression DA-HIST-07]
evidence_requirements: [Still ignored — an edit must not smuggle history past the baseline.]
```
**Steps:** Edit an old (pre-baseline) message so it re-renders.
**Expected Results:** Still ignored — an edit must not smuggle history past the baseline.
**Verified (discord-webhook af853ce):** Enforced by the listener resuming from last_seen_message_id; the backend does NOT read is_edit or reject by snowflake in ingest.

---

## 03 — Schedule windows

```yaml
id: DA-SCHED-01
title: Default mode
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-01]
evidence_requirements: [`always` — existing sources are unaffected by the feature.]
```
**Steps:** Check the default mode on a new source.
**Expected Results:** `always` — existing sources are unaffected by the feature.

---

```yaml
id: DA-SCHED-02
title: market in-session
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-02]
evidence_requirements: [Alert ingested and processed.]
```
**Steps:** market mode, post during 09:30-16:00 ET on a weekday.
**Expected Results:** Alert ingested and processed.

---

```yaml
id: DA-SCHED-03
title: market pre-open
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-03]
evidence_requirements: [Not processed; source shows `off_schedule`.]
```
**Steps:** market mode, post at 08:00 ET.
**Expected Results:** Not processed; source shows `off_schedule`.

---

```yaml
id: DA-SCHED-04
title: extended window
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-04]
evidence_requirements: [Both inside the extended window (04:00-20:00) and processed.]
```
**Steps:** extended mode, post at 08:00 ET and again at 18:00 ET.
**Expected Results:** Both inside the extended window (04:00-20:00) and processed.

---

```yaml
id: DA-SCHED-05
title: market on weekend
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-05]
evidence_requirements: [Not processed.]
```
**Steps:** market mode, post on a Saturday.
**Expected Results:** Not processed.

---

```yaml
id: DA-SCHED-06
title: custom window
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-06]
evidence_requirements: [First processed; the other two not.]
```
**Steps:** custom 10:00->14:00, post at 12:00 / 09:00 / 15:00.
**Expected Results:** First processed; the other two not.

---

```yaml
id: DA-SCHED-07
title: wrap (overnight) window
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-07]
evidence_requirements: [Both processed. end < start is an overnight window, not an empty one.]
```
**Steps:** custom 22:00->02:00, post at 23:00 and at 01:00.
**Expected Results:** Both processed. end < start is an overnight window, not an empty one.

---

```yaml
id: DA-SCHED-08
title: change schedule while connected
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-08]
evidence_requirements: [Takes effect at the next listener poll, without a reconnect.]
```
**Steps:** Change the schedule while connected.
**Expected Results:** Takes effect at the next listener poll, without a reconnect.

---

```yaml
id: DA-SCHED-09
title: independent schedules
primary_func_id: DA-SCHED
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sched, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Schedule windows DA-SCHED-09]
evidence_requirements: [Each honours its own window independently.]
```
**Steps:** Two channels on one account with different schedules.
**Expected Results:** Each honours its own window independently.

---

## 04 — Parser matrix

```yaml
id: DA-PARSE-01
title: 0DTE call entry
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-01]
evidence_requirements: [BUY LIMIT, TSLA 375 CALL, expiry = today.]
```
**Steps:** Post `$TSLA 375 CALL 0DTE @0.95`.
**Expected Results:** BUY LIMIT, TSLA 375 CALL, expiry = today.
**Verified (discord-webhook af853ce):** 0DTE resolves to the message's posted date (today for a live alert).

---

```yaml
id: DA-PARSE-02
title: Dated call, no price
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-02]
evidence_requirements: [BUY LIMIT, AAPL 350 CALL, 18 Sep; limit_price_unspecified.]
```
**Steps:** Post `AAPL $350 CALL 09/18`.
**Expected Results:** BUY LIMIT, AAPL 350 CALL, 18 Sep; limit_price_unspecified.

---

```yaml
id: DA-PARSE-03
title: Compact call with price
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-03]
evidence_requirements: [BUY LIMIT, NVDA 180 CALL, 17 Oct, price 2.40.]
```
**Steps:** Post `$NVDA 180C 10/17 @2.40`.
**Expected Results:** BUY LIMIT, NVDA 180 CALL, 17 Oct, price 2.40.

---

```yaml
id: DA-PARSE-04
title: PUT right (regression guard)
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-04]
evidence_requirements: [BUY LIMIT, SPY 764 PUT — assert the RIGHT (put), not just the strike.]
```
**Steps:** Post `$SPY 764 PUT 0DTE @0.90`.
**Expected Results:** BUY LIMIT, SPY 764 PUT — assert the RIGHT (put), not just the strike.

---

```yaml
id: DA-PARSE-05
title: Stated quantity
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-05]
evidence_requirements: [BUY LIMIT, AAPL 250 CALL, quantity 5.]
```
**Steps:** Post `BUY 5 AAPL 250C SEP18 @ 2.15`.
**Expected Results:** BUY LIMIT, AAPL 250 CALL, quantity 5.

---

```yaml
id: DA-PARSE-06
title: 'market' word on a buy
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-06]
evidence_requirements: [BUY LIMIT — the word 'market' does not override the buy->limit rule (limit_price=None).]
```
**Steps:** Post `BUY AAPL 250C SEP18 MARKET`.
**Expected Results:** BUY LIMIT — the word 'market' does not override the buy->limit rule (limit_price=None).

---

```yaml
id: DA-PARSE-07
title: Entering alert card
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-07]
evidence_requirements: [BUY LIMIT, OKLO 44 CALL, 11 Sep.]
```
**Steps:** Post an alert card: `ENTERING - OKLO $44 CALL - 09/11`.
**Expected Results:** BUY LIMIT, OKLO 44 CALL, 11 Sep.

---

```yaml
id: DA-PARSE-08
title: Emoji in card field
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-08]
evidence_requirements: [Emoji resolved from `img alt`; content not truncated.]
```
**Steps:** Alert card with an embedded image/emoji in the field.
**Expected Results:** Emoji resolved from `img alt`; content not truncated.
**Verified (discord-webhook af853ce):** Restoration happens in the listener observer.js (img[alt] -> text).

---

```yaml
id: DA-PARSE-09
title: Rendered timestamp
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-09]
evidence_requirements: [Timestamp stripped — never leaks into the parsed content.]
```
**Steps:** Message containing a rendered timestamp.
**Expected Results:** Timestamp stripped — never leaks into the parsed content.

---

```yaml
id: DA-PARSE-10
title: Duplicate embed fields
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-10]
evidence_requirements: [One signal, not two.]
```
**Steps:** Same alert card posted twice by the bot (duplicate embed fields).
**Expected Results:** One signal, not two.
**Verified (discord-webhook af853ce):** No dedicated unit test; parse() returns on the first matching embed.

---

```yaml
id: DA-PARSE-11
title: Adding with price
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-11]
evidence_requirements: [BUY LIMIT, MSFT 100 CALL (source_action ADD).]
```
**Steps:** Post `Adding $MSFT 100c @1.90`.
**Expected Results:** BUY LIMIT, MSFT 100 CALL (source_action ADD).

---

```yaml
id: DA-PARSE-12
title: Add without price
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-12]
evidence_requirements: [BUY LIMIT, TSLA 375 CALL.]
```
**Steps:** Post `Add $TSLA 375c`.
**Expected Results:** BUY LIMIT, TSLA 375 CALL.

---

```yaml
id: DA-PARSE-13
title: Add resolves from holding
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-13]
evidence_requirements: [BUY LIMIT; contract resolved from the held position.]
```
**Steps:** Post `Adding $MSFT` while holding one MSFT contract.
**Expected Results:** BUY LIMIT; contract resolved from the held position.

---

```yaml
id: DA-PARSE-14
title: Add with nothing held
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-14]
evidence_requirements: [Refused: no position to resolve the contract from.]
```
**Steps:** Post `Adding $MSFT` while holding nothing.
**Expected Results:** Refused: no position to resolve the contract from.
**Verified (discord-webhook af853ce):** Actual: 'The alert doesn't fully identify the contract and you hold no matching position to resolve it from.'

---

```yaml
id: DA-PARSE-15
title: Add, two contracts held
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-15]
evidence_requirements: [Deterministic refusal (not an arbitrary pick).]
```
**Steps:** Post `Adding $MSFT` while holding two different MSFT contracts.
**Expected Results:** Deterministic refusal (not an arbitrary pick).
**Verified (discord-webhook af853ce):** Actual: 'The alert matches N of your open contracts - it doesn't say which.'

---

```yaml
id: DA-PARSE-16
title: Add without a ticker
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-16]
evidence_requirements: [ignored - 'mentions trading but names no ticker'.]
```
**Steps:** Post `Adding more here` (no ticker).
**Expected Results:** ignored - 'mentions trading but names no ticker'.

---

```yaml
id: DA-PARSE-17
title: Scissors exit
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-17]
evidence_requirements: [SELL MARKET, MSFT 100 CALL.]
```
**Steps:** Post `[scissors] $MSFT 100c +366%`.
**Expected Results:** SELL MARKET, MSFT 100 CALL.

---

```yaml
id: DA-PARSE-18
title: Scissors put exit
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-18]
evidence_requirements: [SELL MARKET, SPY 762 PUT.]
```
**Steps:** Post `[scissors] $SPY 762p -22%`.
**Expected Results:** SELL MARKET, SPY 762 PUT.

---

```yaml
id: DA-PARSE-19
title: Scissors call exit
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-19]
evidence_requirements: [SELL MARKET, SPY 762 CALL.]
```
**Steps:** Post `[scissors] $SPY 762c +210%`.
**Expected Results:** SELL MARKET, SPY 762 CALL.

---

```yaml
id: DA-PARSE-20
title: Arrow close
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-20]
evidence_requirements: [SELL MARKET; contract resolved from the held position.]
```
**Steps:** Post `META -> 100%`.
**Expected Results:** SELL MARKET; contract resolved from the held position.

---

```yaml
id: DA-PARSE-21
title: Negative arrow close
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-21]
evidence_requirements: [SELL MARKET — a negative percentage is still an exit.]
```
**Steps:** Post `NVDA -> -100%`.
**Expected Results:** SELL MARKET — a negative percentage is still an exit.

---

```yaml
id: DA-PARSE-22
title: Small arrow close
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-22]
evidence_requirements: [SELL MARKET.]
```
**Steps:** Post `TSLA -> 25%`.
**Expected Results:** SELL MARKET.

---

```yaml
id: DA-PARSE-23
title: STC with price
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-23]
evidence_requirements: [SELL MARKET — the limit price is ignored for sells.]
```
**Steps:** Post `STC AAPL 250C SEP18 @ 3.10`.
**Expected Results:** SELL MARKET — the limit price is ignored for sells.
**Verified (discord-webhook af853ce):** The parsed SELL still carries limit_price=3.10; the price is dropped at the execution layer, not in the parsed signal.

---

```yaml
id: DA-PARSE-24
title: Custom-emoji scissors
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-24]
evidence_requirements: [Still detected as a sell.]
```
**Steps:** Scissors as a Discord custom emoji rather than unicode.
**Expected Results:** Still detected as a sell.
**Verified (discord-webhook af853ce):** Only if the restored img alt contains a real scissors codepoint; a textual ':scissors:' alt would NOT match. Verify your channels' emoji alt values.

---

```yaml
id: DA-PARSE-25
title: Arrow close, nothing held
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-25]
evidence_requirements: [Refused; quantity must not be 0.]
```
**Steps:** Post `META -> 100%` while holding no META.
**Expected Results:** Refused; quantity must not be 0.
**Verified (discord-webhook af853ce):** MISMATCH with guide wording. Actual: 'The alert doesn't fully identify the contract and you hold no matching position to resolve it from.' (NOT 'You hold no position in that contract to close.', which fires only for a fully-specified unheld contract.)

---

```yaml
id: DA-PARSE-26
title: Scissors exit sizes to holding
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-26]
evidence_requirements: [Quantity = 7 (full position), never the alert's size, never multiplied.]
```
**Steps:** Post `[scissors] $MSFT 100c +366%` while holding 7 contracts.
**Expected Results:** Quantity = 7 (full position), never the alert's size, never multiplied.

---

```yaml
id: DA-PARSE-27
title: Price update, no scissors
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-27]
evidence_requirements: [ignored - 'price update on an open position - not an entry or exit'.]
```
**Steps:** Post `$MSFT 100c +366%` (no scissors).
**Expected Results:** ignored - 'price update on an open position - not an entry or exit'.

---

```yaml
id: DA-PARSE-28
title: Chatter
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-28]
evidence_requirements: [ignored - 'not a trade alert'.]
```
**Steps:** Post `gm everyone`.
**Expected Results:** ignored - 'not a trade alert'.

---

```yaml
id: DA-PARSE-29
title: Commentary
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-29]
evidence_requirements: [ignored - 'not a trade alert'.]
```
**Steps:** Post `SPY calls hit 1.25 again`.
**Expected Results:** ignored - 'not a trade alert'.

---

```yaml
id: DA-PARSE-30
title: Options mention, not an instruction
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-30]
evidence_requirements: [ignored - 'mentions options but isn't a trade instruction'.]
```
**Steps:** Post `BUY AAPL 250 STRIKE SEP 18`.
**Expected Results:** ignored - 'mentions options but isn't a trade instruction'.

---

```yaml
id: DA-PARSE-31
title: Call/put but no strike
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-31]
evidence_requirements: [invalid - 'the alert names a call/put but no strike'.]
```
**Steps:** Post `BUY AAPL CALL SEP 18 @ 2.15`.
**Expected Results:** invalid - 'the alert names a call/put but no strike'.

---

```yaml
id: DA-PARSE-32
title: No expiry
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-32]
evidence_requirements: [invalid - 'the alert has no expiry'.]
```
**Steps:** Post `BUY AAPL 250C @ 2.15`.
**Expected Results:** invalid - 'the alert has no expiry'.

---

```yaml
id: DA-PARSE-33
title: Empty / image-only
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-33]
evidence_requirements: [ignored, no crash.]
```
**Steps:** Post an empty message / image-only post.
**Expected Results:** ignored, no crash.

---

```yaml
id: DA-PARSE-34
title: Very long message
primary_func_id: DA-PARSE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, parse, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Parser matrix DA-PARSE-34]
evidence_requirements: [Handled without error; behaviour defined either way.]
```
**Steps:** Post a 4000-character message with an alert buried in it.
**Expected Results:** Handled without error; behaviour defined either way.
**Verified (discord-webhook af853ce):** No dedicated test; content cap is 8000 chars. Extraction of a buried alert depends on format.

---

## 05 — Approval mode

```yaml
id: DA-MODE-01
title: Manual: pending
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-01]
evidence_requirements: [Row appears with decision `pending`; no order placed.]
```
**Steps:** Manual mode, post a valid alert.
**Expected Results:** Row appears with decision `pending`; no order placed.

---

```yaml
id: DA-MODE-02
title: Accept
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-02]
evidence_requirements: [Decision `approved`; order placed; status `order_created`.]
```
**Steps:** Click Accept on a pending row.
**Expected Results:** Decision `approved`; order placed; status `order_created`.
**Verified (discord-webhook af853ce):** `order_created` and a real order are LIVE-mode only; in paper the approved alert ends at `parsed` with no broker order.

---

```yaml
id: DA-MODE-03
title: Reject
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-03]
evidence_requirements: [Decision `rejected`; no order; row stays visible.]
```
**Steps:** Click Reject on a pending row.
**Expected Results:** Decision `rejected`; no order; row stays visible.

---

```yaml
id: DA-MODE-04
title: Double accept
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-04]
evidence_requirements: [Exactly one order — no double placement.]
```
**Steps:** Click Accept twice quickly on the same row.
**Expected Results:** Exactly one order — no double placement.

---

```yaml
id: DA-MODE-05
title: Auto: placed
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-05]
evidence_requirements: [Auto-approved and placed with no interaction.]
```
**Steps:** Auto mode, post a valid alert.
**Expected Results:** Auto-approved and placed with no interaction.
**Verified (discord-webhook af853ce):** Actual broker placement is live-mode only.

---

```yaml
id: DA-MODE-06
title: Auto: invalid not approved
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-06]
evidence_requirements: [Not auto-approved; no order.]
```
**Steps:** Auto mode, post a message that parses `invalid`.
**Expected Results:** Not auto-approved; no order.

---

```yaml
id: DA-MODE-07
title: Switch manual->auto
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-07]
evidence_requirements: [The pending alert stays pending; only new alerts auto-approve.]
```
**Steps:** Leave an alert pending, switch manual -> auto.
**Expected Results:** The pending alert stays pending; only new alerts auto-approve.

---

```yaml
id: DA-MODE-08
title: Auto persists on reload
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-08]
evidence_requirements: [Auto stays selected (persisted to TraderSettings.discord_execution_mode).]
```
**Steps:** Set auto, refresh the page.
**Expected Results:** Auto stays selected (persisted to TraderSettings.discord_execution_mode).

---

```yaml
id: DA-MODE-09
title: Account-wide
primary_func_id: DA-MODE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: Medium
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, mode, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Approval mode DA-MODE-09]
evidence_requirements: [Applies to both — it is one account-wide setting, not per channel.]
```
**Steps:** Set mode with two channels connected.
**Expected Results:** Applies to both — it is one account-wide setting, not per channel.

---

## 06 — Sizing

```yaml
id: DA-SIZE-01
title: Multiplier 1
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-01]
evidence_requirements: [Quantity 1.]
```
**Steps:** Multiplier 1, alert with no stated quantity.
**Expected Results:** Quantity 1.

---

```yaml
id: DA-SIZE-02
title: Multiplier 3
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-02]
evidence_requirements: [Quantity 3, shown as `3 (1 x 3 multiplier)`.]
```
**Steps:** Multiplier 3, alert with no stated quantity.
**Expected Results:** Quantity 3, shown as `3 (1 x 3 multiplier)`.

---

```yaml
id: DA-SIZE-03
title: Multiplier scales stated qty
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-03]
evidence_requirements: [Quantity 15.]
```
**Steps:** Multiplier 3, `BUY 5 AAPL 250C SEP18 @2.15`.
**Expected Results:** Quantity 15.

---

```yaml
id: DA-SIZE-04
title: Multiplier max 10
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-04]
evidence_requirements: [Accepted.]
```
**Steps:** Multiplier 10 (max).
**Expected Results:** Accepted.
**Verified (discord-webhook af853ce):** Values >10 or <1 are a 422 at the API (Field ge=1,le=10).

---

```yaml
id: DA-SIZE-05
title: Saved multiplier applies
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-05]
evidence_requirements: [Order history shows the multiplied quantity.]
```
**Steps:** Save multiplier 3, then post an alert.
**Expected Results:** Order history shows the multiplied quantity.

---

```yaml
id: DA-SIZE-06
title: Sell not multiplied
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-06]
evidence_requirements: [Sells 2, not 10 — closes are never multiplied.]
```
**Steps:** Multiplier 5, then a sell alert on a 2-contract position.
**Expected Results:** Sells 2, not 10 — closes are never multiplied.

---

```yaml
id: DA-SIZE-07
title: Under the ceiling
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-07]
evidence_requirements: [Order placed — under the ceiling.]
```
**Steps:** Max per contract = 500, alert at premium 2.15 (=$215).
**Expected Results:** Order placed — under the ceiling.

---

```yaml
id: DA-SIZE-08
title: Over the ceiling skips
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-08]
evidence_requirements: [Entry skipped entirely, not trimmed to a smaller size.]
```
**Steps:** Max per contract = 500, alert at premium 7.40 (=$740).
**Expected Results:** Entry skipped entirely, not trimmed to a smaller size.

---

```yaml
id: DA-SIZE-09
title: Ceiling cleared
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-09]
evidence_requirements: [Saved as no ceiling; returns null.]
```
**Steps:** Max per contract cleared (empty).
**Expected Results:** Saved as no ceiling; returns null.

---

```yaml
id: DA-SIZE-10
title: Ceiling non-positive
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Boundary
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-10]
evidence_requirements: [400 'max_per_contract must be positive'.]
```
**Steps:** Max per contract = 0 or -5.
**Expected Results:** 400 'max_per_contract must be positive'.

---

```yaml
id: DA-SIZE-11
title: Ceiling non-numeric
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Boundary
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-11]
evidence_requirements: [400 `invalid_max_per_contract`.]
```
**Steps:** Max per contract = abc.
**Expected Results:** 400 `invalid_max_per_contract`.

---

```yaml
id: DA-SIZE-12
title: Number formatting
primary_func_id: DA-SIZE
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, size, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Sizing DA-SIZE-12]
evidence_requirements: [Displays 500 not 500.00; trail 20 not 20.0000; 12.5 stays 12.5.]
```
**Steps:** Save 500, reload the page.
**Expected Results:** Displays 500 not 500.00; trail 20 not 20.0000; 12.5 stays 12.5.

---

## 07 — Execution

```yaml
id: DA-EXEC-01
title: Paper validates, no order
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-01]
evidence_requirements: [Validated end-to-end, logged as paper, no broker order.]
```
**Steps:** Paper mode, valid alert.
**Expected Results:** Validated end-to-end, logged as paper, no broker order.

---

```yaml
id: DA-EXEC-02
title: Live places
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-02]
evidence_requirements: [Real order at the broker; ID stored on the message row.]
```
**Steps:** Live mode, valid alert.
**Expected Results:** Real order at the broker; ID stored on the message row.
**Verified (discord-webhook af853ce):** The value stored is the internal Order.id (FK), not the broker's external order ID (which lives on the Order row).

---

```yaml
id: DA-EXEC-03
title: Live warning logged
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-03]
evidence_requirements: [A `LIVE TRADING ENABLED` warning is logged with the user ID.]
```
**Steps:** Toggle live on.
**Expected Results:** A `LIVE TRADING ENABLED` warning is logged with the user ID.

---

```yaml
id: DA-EXEC-04
title: Expired contract
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-04]
evidence_requirements: [Refused: 'That contract expired on <date>.']
```
**Steps:** Alert for a contract that expired yesterday.
**Expected Results:** Refused: 'That contract expired on <date>.'

---

```yaml
id: DA-EXEC-05
title: Saturday expiry
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-05]
evidence_requirements: [Refused with a weekday hint and the nearest valid expiry — not a raw 'asset not found'.]
```
**Steps:** Alert with expiry on a Saturday.
**Expected Results:** Refused with a weekday hint and the nearest valid expiry — not a raw 'asset not found'.

---

```yaml
id: DA-EXEC-06
title: Nonexistent strike
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-06]
evidence_requirements: [Refused with a nearest-strike hint.]
```
**Steps:** Alert with a strike that does not exist.
**Expected Results:** Refused with a nearest-strike hint.

---

```yaml
id: DA-EXEC-07
title: Sell to close
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-07]
evidence_requirements: [Submitted as SELL_TO_CLOSE, not SELL_TO_OPEN.]
```
**Steps:** Sell alert on a held option position.
**Expected Results:** Submitted as SELL_TO_CLOSE, not SELL_TO_OPEN.

---

```yaml
id: DA-EXEC-08
title: No symbol
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-08]
evidence_requirements: [Refused: 'The alert names no symbol.']
```
**Steps:** Alert with no symbol.
**Expected Results:** Refused: 'The alert names no symbol.'

---

```yaml
id: DA-EXEC-09
title: No quantity
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-09]
evidence_requirements: [Refused: 'The alert states no quantity.']
```
**Steps:** Entry where quantity cannot be determined.
**Expected Results:** Refused: 'The alert states no quantity.'

---

```yaml
id: DA-EXEC-10
title: Unusable quote
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-10]
evidence_requirements: [Refused: the quote is unusable. No order at a nonsense price.]
```
**Steps:** Contract whose live quote is 0 or unavailable.
**Expected Results:** Refused: the quote is unusable. No order at a nonsense price.
**Verified (discord-webhook af853ce):** The zero-quote refusal string is garbled in code: '...unusable (zero/!).' - report to app team.

---

```yaml
id: DA-EXEC-11
title: Position read fails
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-11]
evidence_requirements: [Refused: "Couldn't read your positions from the broker: ...". No order.]
```
**Steps:** Broker credentials revoked / position read fails.
**Expected Results:** Refused: "Couldn't read your positions from the broker: ...". No order.
**Verified (discord-webhook af853ce):** This refusal only fires on the options path (a position read).

---

```yaml
id: DA-EXEC-12
title: Duplicate within seconds
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-12]
evidence_requirements: [One order only — advisory-lock dedup holds.]
```
**Steps:** Post the identical alert twice within seconds.
**Expected Results:** One order only — advisory-lock dedup holds.

---

```yaml
id: DA-EXEC-13
title: Restart mid-flight
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-13]
evidence_requirements: [No duplicate on recovery; `already_executed` holds.]
```
**Steps:** Accept a row, then restart the backend mid-flight.
**Expected Results:** No duplicate on recovery; `already_executed` holds.

---

```yaml
id: DA-EXEC-14
title: No broker linked
primary_func_id: DA-EXEC
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, exec, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Execution DA-EXEC-14]
evidence_requirements: [Clean refusal, not a 500.]
```
**Steps:** No broker account linked at all.
**Expected Results:** Clean refusal, not a 500.

---

## 08 — Trailing-stop guard

```yaml
id: DA-TRAIL-01
title: Buy creates guard
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-01]
evidence_requirements: [A guard row is created with `sell_count = 0`.]
```
**Steps:** Buy alert opens a position.
**Expected Results:** A guard row is created with `sell_count = 0`.
**Verified (discord-webhook af853ce):** The guard is created only after a successful LIVE placement; a paper buy creates no guard.

---

```yaml
id: DA-TRAIL-02
title: First sell arms
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-02]
evidence_requirements: [Trail armed — position still open, nothing sold.]
```
**Steps:** First sell alert on that contract.
**Expected Results:** Trail armed — position still open, nothing sold.

---

```yaml
id: DA-TRAIL-03
title: Second sell closes
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-03]
evidence_requirements: [Position closed in full.]
```
**Steps:** Second sell alert on the same contract.
**Expected Results:** Position closed in full.
**Verified (discord-webhook af853ce):** The arm-then-close sequence is only exercised in LIVE mode; in paper the first sell finds no guard and closes.

---

```yaml
id: DA-TRAIL-04
title: Peak advances
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-04]
evidence_requirements: [peak_price advances each tick; no exit on a new high.]
```
**Steps:** Armed guard, price rises repeatedly.
**Expected Results:** peak_price advances each tick; no exit on a new high.

---

```yaml
id: DA-TRAIL-05
title: Above trigger holds
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-05]
evidence_requirements: [Above the 8.00 trigger — no close.]
```
**Steps:** Armed at 20%, peak 10.00, price falls to 8.10.
**Expected Results:** Above the 8.00 trigger — no close.

---

```yaml
id: DA-TRAIL-06
title: Trigger hit closes
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-06]
evidence_requirements: [Trigger hit — position closed, guard retired. trigger = peak x (1 - trail%).]
```
**Steps:** Same, price falls to 7.90.
**Expected Results:** Trigger hit — position closed, guard retired. trigger = peak x (1 - trail%).

---

```yaml
id: DA-TRAIL-07
title: Manual close retires guard
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-07]
evidence_requirements: [Guard retired as 'position no longer held' — no stray order.]
```
**Steps:** Armed guard, position closed manually in the broker app.
**Expected Results:** Guard retired as 'position no longer held' — no stray order.

---

```yaml
id: DA-TRAIL-08
title: Read fail skips tick
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-08]
evidence_requirements: [Tick skipped. Nothing is exited on a failed read.]
```
**Steps:** Armed guard, broker position read fails on a tick.
**Expected Results:** Tick skipped. Nothing is exited on a failed read.

---

```yaml
id: DA-TRAIL-09
title: Failed close re-arms
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-09]
evidence_requirements: [Guard stays armed and retries next tick — a failed exit is never forgotten.]
```
**Steps:** Trail trigger hit but the close order fails.
**Expected Results:** Guard stays armed and retries next tick — a failed exit is never forgotten.

---

```yaml
id: DA-TRAIL-10
title: No-guard sell closes
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Functional
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-10]
evidence_requirements: [Treated as a CLOSE, not an arm.]
```
**Steps:** Sell alert for a position with no guard (opened before this feature).
**Expected Results:** Treated as a CLOSE, not an arm.

---

```yaml
id: DA-TRAIL-11
title: Trail validation
primary_func_id: DA-TRAIL
related_func_ids: []
module: discord
test_level: L4
test_type: Boundary
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, trail, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Trailing-stop guard DA-TRAIL-11]
evidence_requirements: [First three 400; 15 saves and persists.]
```
**Steps:** Set trail to 0, 150, abc; then 15.
**Expected Results:** First three 400; 15 saves and persists.
**Verified (discord-webhook af853ce):** 0 and 150 -> 'trail_percent must be between 0 and 100'; 'abc' -> 'invalid_trail_percent' (both 400).

---

## 09 — Order history UI

```yaml
id: DA-UI-01
title: Shared grid
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-01]
evidence_requirements: [Alerts listed in the same orders grid; no separate table introduced.]
```
**Steps:** Open the Discord tab.
**Expected Results:** Alerts listed in the same orders grid; no separate table introduced.

---

```yaml
id: DA-UI-02
title: Live over SSE
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-02]
evidence_requirements: [Row appears live over SSE (discord.message_received) — no manual refresh.]
```
**Steps:** Post an alert while the page is open.
**Expected Results:** Row appears live over SSE (discord.message_received) — no manual refresh.

---

```yaml
id: DA-UI-03
title: Source label
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-03]
evidence_requirements: [Source label shown above the symbol, using the name the trader gave the channel.]
```
**Steps:** Inspect a row.
**Expected Results:** Source label shown above the symbol, using the name the trader gave the channel.

---

```yaml
id: DA-UI-04
title: Open-position chip
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-04]
evidence_requirements: ['open position' chip shown.]
```
**Steps:** Row for a position already held.
**Expected Results:** 'open position' chip shown.
**Verified (discord-webhook af853ce):** The chip is driven by contract_unspecified (alert named only a symbol), not by whether a position is actually held.

---

```yaml
id: DA-UI-05
title: Multiplier marker
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-05]
evidence_requirements: [Effective quantity shown, with the (1x) marker distinguishing base from multiplied.]
```
**Steps:** Multiplier 3 active.
**Expected Results:** Effective quantity shown, with the (1x) marker distinguishing base from multiplied.

---

```yaml
id: DA-UI-06
title: Discord actions
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-06]
evidence_requirements: [Accept and Reject only — no Cancel button.]
```
**Steps:** Action column on the Discord tab.
**Expected Results:** Accept and Reject only — no Cancel button.

---

```yaml
id: DA-UI-07
title: Cancel elsewhere
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-07]
evidence_requirements: [Cancel still present — it was only suppressed for Discord.]
```
**Steps:** Action column on every other tab.
**Expected Results:** Cancel still present — it was only suppressed for Discord.

---

```yaml
id: DA-UI-08
title: Failure reason visible
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-08]
evidence_requirements: [The refusal reason is readable in the UI, not just in logs.]
```
**Steps:** An `order_failed` row.
**Expected Results:** The refusal reason is readable in the UI, not just in logs.
**Verified (discord-webhook af853ce):** Surfaced as a hover tooltip on the 'Not placed' text, not an inline cell.

---

```yaml
id: DA-UI-09
title: Pagination
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-09]
evidence_requirements: [Pagination works; ordering is stable (created_at desc).]
```
**Steps:** Post 60+ alerts.
**Expected Results:** Pagination works; ordering is stable (created_at desc).

---

```yaml
id: DA-UI-10
title: Mobile reflow
primary_func_id: DA-UI
related_func_ids: []
module: discord
test_level: L4
test_type: UI
priority: P2
risk: Low
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, ui, P2]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Order history UI DA-UI-10]
evidence_requirements: [Cards and the sizing row reflow; no horizontal page scroll.]
```
**Steps:** Discord page at mobile width.
**Expected Results:** Cards and the sizing row reflow; no horizontal page scroll.

---

## 10 — Security

```yaml
id: DA-SEC-01
title: No token in API body
primary_func_id: DA-SEC
related_func_ids: []
module: discord
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sec, api, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Security DA-SEC-01]
evidence_requirements: [No session token, no cookies. Only a safe descriptor (present, cookie_count, captured_at, age_days).]
```
**Steps:** Inspect every /api/discord-sources response body.
**Expected Results:** No session token, no cookies. Only a safe descriptor (present, cookie_count, captured_at, age_days).

---

```yaml
id: DA-SEC-02
title: No secrets in logs
primary_func_id: DA-SEC
related_func_ids: []
module: discord
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sec, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Security DA-SEC-02]
evidence_requirements: [No Discord token, cookie, broker key or access token in plaintext.]
```
**Steps:** Grep application logs after a full connect + alert cycle.
**Expected Results:** No Discord token, cookie, broker key or access token in plaintext.

---

```yaml
id: DA-SEC-03
title: No client-side creds
primary_func_id: DA-SEC
related_func_ids: []
module: discord
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sec, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Security DA-SEC-03]
evidence_requirements: [No credentials logged client-side.]
```
**Steps:** Open the browser console on the Discord page.
**Expected Results:** No credentials logged client-side.

---

```yaml
id: DA-SEC-04
title: Fernet at rest
primary_func_id: DA-SEC
related_func_ids: []
module: discord
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sec, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Security DA-SEC-04]
evidence_requirements: [Session is Fernet-encrypted at rest, not readable plaintext.]
```
**Steps:** Read the discord_accounts row directly in the DB.
**Expected Results:** Session is Fernet-encrypted at rest, not readable plaintext.

---

```yaml
id: DA-SEC-05
title: No cross-tenant read
primary_func_id: DA-SEC
related_func_ids: []
module: discord
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sec, api, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Security DA-SEC-05]
evidence_requirements: [404/403 — no cross-tenant read (_get_owned ownership check).]
```
**Steps:** Trader A requests Trader B's source, signals, or settings by ID.
**Expected Results:** 404/403 — no cross-tenant read (_get_owned ownership check).

---

```yaml
id: DA-SEC-06
title: Listener token required
primary_func_id: DA-SEC
related_func_ids: []
module: discord
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Automated
automation_ref: 'automation/api/tests/discord/discord-access.spec.ts'
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sec, api, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Security DA-SEC-06]
evidence_requirements: [Rejected (503 if unconfigured, 401 on mismatch; compare_digest).]
```
**Steps:** Call internal listener endpoints without the listener token.
**Expected Results:** Rejected (503 if unconfigured, 401 on mismatch; compare_digest).

---

```yaml
id: DA-SEC-07
title: No permission bypass
primary_func_id: DA-SEC
related_func_ids: []
module: discord
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sec, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Security DA-SEC-07]
evidence_requirements: [Clean error. No attempt to bypass Discord permissions.]
```
**Steps:** Watch a channel the account lacks permission for.
**Expected Results:** Clean error. No attempt to bypass Discord permissions.
**Verified (discord-webhook af853ce):** Permission-failure detection is listener-side; the backend does not bypass and surfaces last_error.

---

```yaml
id: DA-SEC-08
title: No CAPTCHA solving
primary_func_id: DA-SEC
related_func_ids: []
module: discord
test_level: L4
test_type: Security
priority: P0
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, sec, P0]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Security DA-SEC-08]
evidence_requirements: [Surfaced to the user to resolve. No automated solving or evasion.]
```
**Steps:** Trigger Discord's CAPTCHA / MFA during login.
**Expected Results:** Surfaced to the user to resolve. No automated solving or evasion.
**Verified (discord-webhook af853ce):** Detection is listener-side; no CAPTCHA-solving code exists.

---

## 11 — Regression — existing behaviour

```yaml
id: DA-REG-01
title: Manual order unchanged
primary_func_id: DA-REG
related_func_ids: []
module: discord
test_level: L4
test_type: Regression
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, reg, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Regression — existing behaviour DA-REG-01]
evidence_requirements: [Unchanged behaviour (Discord reuses _place_trader_order with no special branching).]
```
**Steps:** Place a manual trader order with Discord connected.
**Expected Results:** Unchanged behaviour (Discord reuses _place_trader_order with no special branching).

---

```yaml
id: DA-REG-02
title: Fans out to subscribers
primary_func_id: DA-REG
related_func_ids: []
module: discord
test_level: L4
test_type: Regression
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, reg, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Regression — existing behaviour DA-REG-02]
evidence_requirements: [Order fans out to subscribers exactly like any other trader order.]
```
**Steps:** Discord alert places a trader order; trader has subscribers.
**Expected Results:** Order fans out to subscribers exactly like any other trader order.

---

```yaml
id: DA-REG-03
title: Subscriber settings independent
primary_func_id: DA-REG
related_func_ids: []
module: discord
test_level: L4
test_type: Regression
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: true
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, reg, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Regression — existing behaviour DA-REG-03]
evidence_requirements: [Subscriber settings applied — independent of the Discord multiplier.]
```
**Steps:** Subscriber multiplier and max-per-contract on a Discord-sourced fanout.
**Expected Results:** Subscriber settings applied — independent of the Discord multiplier.

---

```yaml
id: DA-REG-04
title: Feature off is inert
primary_func_id: DA-REG
related_func_ids: []
module: discord
test_level: L4
test_type: Regression
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, reg, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Regression — existing behaviour DA-REG-04]
evidence_requirements: [Copy trading, P&L, EOD autoclose all behave as before.]
```
**Steps:** Turn the Discord feature off entirely.
**Expected Results:** Copy trading, P&L, EOD autoclose all behave as before.

---

```yaml
id: DA-REG-05
title: Profit target vs trail
primary_func_id: DA-REG
related_func_ids: []
module: discord
test_level: L4
test_type: Regression
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, reg, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Regression — existing behaviour DA-REG-05]
evidence_requirements: [Liquidation and the guard do not fight; no double exit.]
```
**Steps:** Daily profit target fires while a Discord trail is armed.
**Expected Results:** Liquidation and the guard do not fight; no double exit.
**Verified (discord-webhook af853ce):** No explicit intra-tick mutual guard; mitigated by position-gone retire + advisory-lock dedup, not eliminated.

---

```yaml
id: DA-REG-06
title: Full backend suite
primary_func_id: DA-REG
related_func_ids: []
module: discord
test_level: L4
test_type: Regression
priority: P1
risk: High
environment: [qa]
production_safe: false
destructive: false
automation_candidate: false
automation_status: Not Automated
automation_ref: ''
owner: unassigned
status: Draft
last_reviewed: 2026-09-16
tags: [discord, reg, P1]
source_refs: [Kopyya Discord Alerts Test Plan (artifact DizfMPE5Cam1irSxCRoRJy), Regression — existing behaviour DA-REG-06]
evidence_requirements: [No new failures against the established baseline.]
```
**Steps:** Run the full backend suite.
**Expected Results:** No new failures against the established baseline.
**Verified (discord-webhook af853ce):** The guide's '372 passing / 5 known failures' baseline is unverifiable: no such baseline is documented on the branch, and the suite has 343 test defs with 0 skip/xfail markers. Re-derive the baseline from an actual run.

---
