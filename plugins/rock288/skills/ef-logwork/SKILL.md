---
name: ef-logwork
description: "Log Everfit Jira worklogs in the Core Team format ([Activity] – [What] – [Outcome], 15m steps, VN date) from today's git commits + PR reviews. Suggests cards and descriptions, you type the hours, shows a draft with the daily total vs 7h, then logs on confirm. --audit reports days under 7h, empty days and badly formatted worklogs (read-only). Triggers on: 'logwork', 'log work', 'log time', 'timesheet', 'log giờ', 'chấm công', 'audit worklog'."
argument-hint: "[free text e.g. '3h UP-79399, 15m standup'] [--date=YYYY-MM-DD] [--yes] [--shared=UP-XXXXX] [--no-git] [--audit[=from..to]] [--dry-run]"
metadata:
  author: rock288
  version: "1.0.1"
---

# EF Logwork

Log today's Jira worklogs the way the Core Team guideline wants them — right card, right **VN**
date, 15-minute steps, `[Activity] – [What] – [Outcome]` — without rebuilding the day from
memory. Git commits and PR reviews **suggest** cards + descriptions; **hours always come from
you** (the skill never pads a day up to 7h).

**IMPORTANT:** This skill only **adds** worklogs (and saves its own `memory/logwork.md`:
missing fields, a new sprint's shared card, `--shared`). It never edits cards, transitions
them, or touches existing worklogs. `--audit` is read-only. Atlassian MCP has **no
delete-worklog tool** — the draft → confirm gate is the safety net, and every created
`worklogId` is echoed so a mistake can be edited.

**Cloud id:** `everfit.atlassian.net` on every Atlassian MCP call.
**`$SKILL_DIR`** = the "Base directory for this skill" path printed when this skill loads.

## Flags

| Flag | Default | Effect |
|---|---|---|
| free text (positional) | — | Items with hours, e.g. `3h UP-79399, 2h UP-79336, 15m standup, 1h sync BE`. Present → skip the "reply with hours" prompt. |
| `--date=YYYY-MM-DD` | today (VN) | VN calendar day to log on / read. |
| `--yes` | off | Auto-confirm a draft with **zero ⚠** (still prints it). Any ⚠ → waits for you anyway. |
| `--shared=UP-XXXXX` | config | Shared card for non-ticket work; saved to config. |
| `--no-git` | off | Skip git/PR suggestions; free text only. |
| `--dry-run` | off | Stop after the draft. No Jira writes, no config writes. Beats `--yes`. |
| `--audit[=from..to]` | 10 working days | Read-only compliance report — see §Audit. Ignores the log flags. |

## Rules at a glance (guideline §2 + PC)

| Rule | Value |
|---|---|
| Description | `[Activity] – [What] – [Outcome]`, en dash ` – `, Outcome optional |
| Activities | `Dev` `QA` `Review` `Bug fix` `Ceremony` `Meeting` `Support` `Learning` `Leave` |
| Unit | 15 minutes, rounded to nearest |
| Date started | the VN day the work happened (PC converts to GMT+7) |
| Daily minimum | `daily_min_hours` (7h); guideline standard 8h, ≥ 80%/sprint |
| Non-ticket work | the sprint's shared card (`shared_card`) — no child cards |
| Card-specific meeting / review | on **that** card, not the shared one |

Full rules, keyword map, regex, examples: [`references/format-rules.md`](references/format-rules.md).

## Workflow

**Write guard:** under `--dry-run` or `--audit` nothing is written — no worklog, no config
file. Every "save"/"write" below is skipped there (asked values are used for this run only).

### 0. Date
`<date>` = `--date`, else run `TZ=Asia/Ho_Chi_Minh date +%F` — never infer "today" from the
conversation (resumed sessions carry a stale date). Every draft and echo starts with
`Ngày log: <date> (<Ddd>, VN)`.

### 1. Config
Read `memory/logwork.md` (this skill's folder). Missing fields → ask once via
`AskUserQuestion`, write the file, continue.

### 2. Shared card
`--shared` wins → save to config. Otherwise detect the current sprint's epic:
```
project = UP AND issuetype = Epic AND summary ~ "General Task" AND created >= -60d ORDER BY created DESC
```
`fields: ["summary","status"]`, `maxResults: 20`. Keep the first row whose summary starts
with `General Task - Sprint` **and** contains `shared_epic_squad` (case-insensitive substring
match done here, not in JQL — Jira tokenizes `Platform&Capability` as one word, so
`summary ~ "Platform"` never matches). Found ≠ config → ask once
"Sprint mới: `<key>` `<summary>` — dùng card này?" → yes = save. Nothing found / JQL error →
use config + one-line warning.

### 3. Collect
- **Git + reviews** (skip on `--no-git`):
  `node $SKILL_DIR/scripts/git-activity.cjs --date=<date> --roots=<repo_roots> --projects=<card_projects>`
  → JSON `{ cards[], reviews[], unmatched[], errors[] }`. Mention `errors[]` in one line; never
  stop on them. Non-zero exit → show its stderr and continue as `--no-git`.
- **Ledger** — my existing worklogs of that VN day:
  [`references/worklog-ledger.md`](references/worklog-ledger.md).
- **Card facts** — one `searchJiraIssuesUsingJql` `key in (<all suggested + typed keys>)`,
  `fields: ["summary","status","issuetype"]`. Unknown keys are simply absent from the result
  (verified 2026-10-06 — no JQL error) → move them to unmatched.

### 4. Suggest
Rendered markdown table: card (linked) · summary · proposed description · `? h` — tag rows
whose `cardFrom` is `branch` with `(card từ branch)`, and ask for the card of a review whose
`card` is null (never default it to the shared card); then the
ledger rows as `đã log hôm nay: <card> <time> <comment>` + ledger total; then `unmatched`
subjects (may belong to a card the user names). Free text in args → go straight to step 5.
Otherwise ask the user to **reply in chat** with hours per row + any extra items (meetings,
support, standup) — plain reply, not `AskUserQuestion`.

### 5. Normalize — per [`format-rules.md`](references/format-rules.md)
Durations → 15m (`50m→45m` shown) · keywords → Activity + shared card · card items → `Dev` /
`Bug fix` by issuetype · reviews → `Review – Code review PR #N (<repo>) – <state>` on the PR's
card · user-written descriptions → fixed to the format (en dash, Activity word), meaning kept.

### 6. Validate — warn, never block
- description fails the regex or the What is generic
- card status category Done
- per-card VN-day total (ledger + new) ≥ `max_card_hours_per_day`
- day total (ledger + new) < `daily_min_hours` → show the gap; **do not** invent items to fill it
- duplicate of a ledger entry (same card + description) → dropped unless the user insists;
  possible duplicate (e.g. `standup` vs logged `daily meeting` on the shared card) → warned
- `--date` is Sat/Sun → "weekend — đúng ngày chưa?"
- meeting about a specific card placed on the shared card → suggest the card

### 7. Draft
Rendered markdown table (never a code block): `#` · card link · time · description ·
started (`HH:MM`) · warnings, under the `Ngày log:` header. Footer:
`Total: new Xh + existing Yh = Zh / 7h`. Wait for OK or edits (apply, re-render).
`--dry-run` → stop here (even with `--yes`). `--yes` → continue without waiting **only if the
draft has no ⚠**; otherwise wait like a normal run.

### 8. Write — sequentially, stop at the first error
```
addWorklogToJiraIssue {
  cloudId: "everfit.atlassian.net", issueIdOrKey: "<card>", timeSpent: "1h 30m",
  started: "<date>T<HH:MM>:00.000+0700", commentBody: "<description>", contentFormat: "markdown"
}
```
`started` per the placement rule in [`worklog-ledger.md`](references/worklog-ledger.md)
(chain from `max(day_start, last ledger block end)`; always explicit `+0700`). No
`visibility`. A 403 / permission error (e.g. review on another squad's card) → stop, report,
ask where to log it — **never** silently re-route to the shared card.

### 9. Echo
`Ngày log:` header, then table: card · time · description · `worklogId`; then
`Day total: Zh / 7h` (✅ / ⚠ gap).
Partial failure → list what was written and what was not.

## Audit (`--audit`)

Read-only report over a VN date range: per-day logged hours vs `daily_min_hours` (❌ empty
working day, ⚠ short day / one card ≥ 8h / weekend entry), sprint total vs target, bad-format
entries with suggested rewrites (text only), and `/rk:ef-logwork --date=…` next actions.
`--audit` = last 10 working days; `--audit=YYYY-MM-DD..YYYY-MM-DD` = explicit range (≤ 31 days).
Procedure + output format: [`references/audit.md`](references/audit.md).

## Notes

- Fix a wrong entry: `addWorklogToJiraIssue` with the echoed `worklogId` (+ `timeSpent` /
  `started` / `commentBody`) updates it in place — the tool schema says "When worklogId is
  provided, updates that worklog" (checked 2026-10-06). On the other Atlassian server the same
  edit is `executeWrite addOrEditJiraIssueWorklog` with `comment` (not `commentBody`). There is
  no delete.
- Logging time lowers the card's remaining estimate (standard Jira) — progress % in
  `/rk:ef-daily-report` moves accordingly.
- Tip outside this skill: set the Jira profile timezone to `Asia/Ho_Chi_Minh` so the Jira UI
  and the PC extension stop showing VN mornings on the previous day.
- `git-activity.cjs` scans the **direct children** of each `repo_roots` entry; add more roots
  (comma-separated) for repos nested deeper.
