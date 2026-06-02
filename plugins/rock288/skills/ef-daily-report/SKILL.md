---
name: rk:ef-daily-report
description: "Generate an Everfit daily standup report from Jira worklogs and post it as a reply into a Slack thread you provide. Pulls cards you logged work on the target date (DONE / PROGRESS CHANGED) plus your open-sprint cards (PLAN FOR TODAY), derives progress % from time tracking, then drafts the report for your review before replying into the thread. Triggers on: 'daily report', 'standup', 'daily', 'EOD report', 'báo cáo ngày', 'wrap up'."
argument-hint: "[<slack-thread-url>] [--date=YYYY-MM-DD] [--thread=<url>] [--no-slack] [--platform=Backend|Web|...] [--blocker=...] [--at-risk=...] [--question=...] [--dry-run]"
metadata:
  author: rock288
  version: "2.0.0"
---

# Daily Report

Build the team's daily standup report from Jira and **reply it into a Slack thread you
provide** (the report is a comment in that thread, not a new channel message).
**Variant B flow:** fetch → derive → show the full draft in chat → user edits → **then**
post. Never post without confirmation (unless `--no-slack`/`--dry-run`).

**IMPORTANT:** Do not implement code or modify Jira. This skill only reads Jira, formats a
report, and posts to Slack.

## Flags

| Flag | Default | Effect |
|---|---|---|
| `<slack-thread-url>` (positional) or `--thread=<url>` | — | The Slack message/thread URL to reply into. Channel + thread_ts are parsed from the URL. Required to post (omit only with `--no-slack`/`--dry-run`). |
| `--date=<YYYY-MM-DD>` | yesterday | The day to pull worklogs for (the "yesterday" anchor). |
| `--no-slack` | off | Print the report, do not post to Slack. |
| `--platform=<...>` | config | Override the Platform line (`Backend / Web / Android / iOS / QA / BA`). |
| `--blocker=<text>` | None | Fill the Blocker field without prompting. |
| `--at-risk=<text>` | None | Fill the At-risk field without prompting. |
| `--question=<text>` | None | Fill the Question field without prompting. |
| `--dry-run` | off | Derive + print only; no Slack post, no config writes. |

## Report format (authoritative)

```
DAILY REPORT — [DD Mon YYYY]   ← TODAY's date (posting day, Asia/Saigon), NOT --date
Name: [name]
Platform: [Backend / Web / Android / iOS / QA / BA]
——————————————————
DONE YESTERDAY
[Product Item Name]
 • [Task name]
 ◦ Progress: 100%
 • [Task name — not yet done]
 ◦ Progress: X%
 ◦ Remaining: [what is left]

PROGRESS CHANGED
[Product Item Name]
 • [Task name]
 ◦ Progress: X% → Y%
 ◦ Reason: [cause]

PLAN FOR TODAY
[Product Item Name]
 • [Task name]
 ◦ Progress: X% by EOD | Full task done: [date / EOD / DD Mon]
 ◦ AI: None OR [how Claude will be used]

Blocker: None OR [...]
At-risk: None OR [...]
Question: None OR [...]
```

**Header date = today** (posting day, Asia/Saigon). `--date` only selects which day's worklogs
feed DONE / PROGRESS CHANGED — it does NOT change the header.

Empty section → print `None`. If a PROGRESS CHANGED card logged time but the % didn't move,
use `◦ Progress: Still X%` with a **mandatory** `◦ Reason:` (blocker/slowdown).

**Card links:** append each task's card ID as a Jira link —
`[Task name] ([UP-XXXXX](https://everfit.atlassian.net/browse/UP-XXXXX))`. Use standard
markdown link syntax (renders as a clickable link in both Slack backends and the chat draft).

## Workflow

### 1. Load config
Load per-repo config from `memory/daily_report.md` (this skill's folder). Fields:
- `name` — report header name.
- `platform` — default Platform line.
- `jira_account` — usually omit (use `currentUser()`); set an `accountId` only to report for someone else.

The Slack channel is **not** stored — it's parsed from the thread URL each run.

**First run / missing fields** (skip writes under `--dry-run`): ask once via `AskUserQuestion`
for `name` + `platform`, write the file, continue. Subsequent runs load silently.

### 2. Derive from Jira
Follow [`references/derivation.md`](references/derivation.md) exactly:
- **Only cards assigned to me** — both queries require `assignee = currentUser()`. A card I
  logged work on (or created) but that is assigned to someone else is excluded.
- **`--date` is a Vietnam (Asia/Saigon) calendar day.** JQL `worklogDate` runs in the Jira
  account tz (LA, ~14h behind), so query a **widened** window (`worklogDate >= date-1 AND <
  date+2`) as a coarse pre-filter, then **bucket each worklog `started` converted to VN** and
  keep only entries whose VN date == `--date`. `loggedTarget` = Σ of those.
- `getJiraIssue` per card → progress % = `timeSpent / (timeSpent + remaining)`; reconstruct the
  `before% → now%` delta from `loggedTarget` (no state file).
- **Worklog comments are optional** — the delta comes from logged time alone. `Reason` =
  `logged <time>, <status>`; only append a comment if one exists.
- Map Epic/parent → Product Item, summary → Task name.

### 3. Assemble the report
Fill the format above. Set the **header date to today** (posting day, Asia/Saigon). Manual
fields (Blocker / At-risk / Question) default to `None` — **never prompt** for them; only fill
from `--blocker`/`--at-risk`/`--question` if passed. `--platform` overrides the config platform.

### 4. Draft → confirm (Variant B)
**Print the full report in chat.** Invite the user to edit (they reply with corrections; apply
them). Do not proceed to Slack until the user confirms. `--dry-run` / `--no-slack` stop here.

### 5. Reply into the Slack thread

**Parse the thread URL** (positional arg or `--thread=`). Accepted forms:
- `https://<workspace>.slack.com/archives/<CHANNEL_ID>/p<DIGITS>` →
  `channel_id = <CHANNEL_ID>`; message ts = insert a dot 6 digits from the end of `<DIGITS>`
  (drop the leading `p`), e.g. `p1727890123456789` → `1727890123.456789`.
- If the URL has a query `?thread_ts=<ts>&cid=<CHANNEL_ID>` (a link to a reply *inside* a
  thread), prefer `thread_ts` from the query and `cid` for the channel.
- The parsed message ts becomes `thread_ts` so the report posts **as a reply in that thread**.

**Post** — mirror [`ef-ship`](../ef-ship/SKILL.md) §10 backend selection, always passing `thread_ts`:
- **Preferred** (if registered): `mcp__slack-mcp__conversations_add_message` with `channel_id`,
  `thread_ts`, `text` = the report, `content_type` = `text/markdown`.
- **Fallback** (default bundled): `mcp__claude_ai_Slack__slack_send_message` with `channel_id`,
  `thread_ts`, `message` = the report.
- Capture the returned reply `ts`. On failure, surface the error but don't crash — print the
  report so the user can paste it into the thread manually.

## Notes

- `currentUser()` keys all queries off the authenticated Atlassian account — no account lookup needed for self-reporting.
- No channel is stored — every post targets the thread URL given that run.
- Keep the report concise; sacrifice grammar for brevity (team convention).
