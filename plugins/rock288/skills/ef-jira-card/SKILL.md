---
name: ef-jira-card
description: "Create Everfit Jira card(s) in the team's house format from a chat request, a Slack thread link, or the current conversation. Builds the summary tags + the Epic/Point metadata line + Context/Goal|Symptom/Tasks|Investigate/Reference/AC body, resolves epic/priority/assignee/fixVersion, then creates the card immediately (no confirmation) and echoes what it wrote. Triggers on: 'tạo card', 'tạo card jira', 'tạo ticket', 'create jira card', 'create card', 'open a jira card', 'tách thành N card', 'tạo card từ thread này'."
argument-hint: "<mô tả | slack-thread-url | (trống = lấy ngữ cảnh chat)> [--epic=UP-XXXXX] [--point=N] [--type=Task|Bug|Improvement] [--priority=Medium|High|Highest] [--assignee=me|<email>] [--project=UP] [--fix-version=<name>|none] [--prefix=S] [--pr=<url>] [--dry-run]"
metadata:
  author: rock288
  version: "1.0.0"
---

# EF Jira Card

Turn a request into Jira card(s) on `everfit.atlassian.net` in the format the team's own
engineering cards use — then **create them immediately**. There is deliberately no
confirmation gate; §Guard is what replaces it.

**Cloud id:** pass `everfit.atlassian.net` as `cloudId` to every Atlassian MCP call.

## Guard — when NOT to create

Atlassian MCP has **no delete tool** (create / edit / transition only). A wrong card cannot be
removed by command — it stays on the team board until someone edits it or moves it to
`WILL NOT FIX`. So:

1. **Only fire on an imperative create request** — the message must have a create verb
   (`tạo` / `create` / `mở` / `open` / `add`) **and** a card word (`card` / `ticket` / `jira`),
   or be an explicit `/rk:ef-jira-card` invocation. Discussion sentences —
   "card này nên tách mấy card?", "card kia format sao?", "đọc card UP-75554" — must be
   ANSWERED, never created. When it reads like a question, ask; do not create.
2. **Cap 10 cards per run.** More than 10 candidates → create the first 10, list the rest as
   skipped and say so.
3. **Create sequentially, stop at the first API error** — never keep going through a broken
   batch.
4. **Echo the full summary + description of every created card** after creating. That is what
   makes a format slip fixable with one `editJiraIssue`.
5. `--dry-run` prints the exact payload and creates nothing.

## Flags

| Flag | Default | Effect |
|---|---|---|
| positional | — | The request. Free text, a Slack permalink, or empty (= use the current conversation). |
| `--epic=UP-XXXXX` | inferred, else ask | Parent epic. Inferred from the request/thread/conversation when an epic key is mentioned. **Never guess** — a card with no parent falls off the sprint board (UP-74988, UP-73686). Ask once via `AskUserQuestion`, then continue. |
| `--point=N` | heuristic | `Point:` value in the description. Heuristic: ≤2 tasks → 1, 3–5 → 2, >5 → 3. |
| `--type=<...>` | `Task` | `Bug` when the request reads like a defect (bug / lỗi / fail / error / crash / không hoạt động). Also accepts `Improvement`, `Story`, `Technical Task`. |
| `--priority=<...>` | `Medium` | `High` when the request says urgent / blocker / client-impacting. |
| `--assignee=me\|<email>` | `me` | `me` → the authenticated account (`atlassianUserInfo`). An email → `lookupJiraAccountId`. |
| `--project=<KEY>` | `UP` | Other projects work, but the tag/epic conventions here are UP's. |
| `--fix-version=<name>` | `To be confirmed` | Matches what the team's in-flight cards carry. `none` omits the field. |
| `--prefix=S` | off | Sequenced batch: card *i* gets `[S<i>]` as its first summary tag (UP-73687 / UP-73688 style). |
| `--pr=<url>` | — | Adds a `PR: <url>` line to the metadata block (UP-73676 style). |
| `--dry-run` | off | Print the payload, create nothing. |

## Card format (authoritative)

### Summary

```
[Tag][Tag] <imperative title>
```

- Tags, in order: sequence (`[S4]`, only with `--prefix`) → platform (`[API]` / `[BE]` /
  `[BE][FE]` / `[Tool]`) → feature, taken from the epic's name (`[Data Migration]`,
  `[Migration]`, `[Onboarding]`) → `[Bug]` when the type is Bug. Max 3 tags.
- English, verb first, **no trailing period** (that is the team's own style; the period in
  QA-authored cards like UP-75554 is theirs, not ours).

### Description

Bold labels and `*` bullets. **Never `##` headings** — that is the QA/AI format, not this one.
Blank line between blocks. One line per bullet. English. Concision over grammar.

```
Epic: UP-73605 · Point: 2
PR: <url>                        ← only with --pr

**Context:**
<why this exists — 1-3 sentences, name the trigger: coach report, client feedback, sprint request, migration run>

**Goal:**                        ← Task / Improvement
<one sentence, the outcome>

**Symptom:**                     ← Bug, replaces Goal
* <observable failure>

**Tasks:**                       ← Task / Improvement
* <actionable step, with file paths when known>

**Investigate:**                 ← Bug, replaces Tasks
* <file path (what to check there)>
* <how to narrow the root cause>

**Reference:**                   ← only when links exist
* Slack thread: <url>
* <PR / doc / exported data file>

**AC:**
* <verifiable outcome>
* <idempotency / re-run behaviour when the work touches migration or queues>
* <unit test added/updated — when the change is testable>
```

`Epic:` and `Point:` on ONE line joined by ` · `. `PR:` on its own line under it.

## Field defaults

| Field | Value |
|---|---|
| project | `UP` (`--project`) |
| issue type | `Task`; `Bug` on defect wording (`--type`) |
| parent | the epic — **required**, ask when unresolved |
| priority | `Medium`; `High` on urgency wording (`--priority`) |
| assignee | authenticated account (`--assignee`) |
| fixVersions | `To be confirmed` (`--fix-version=none` to omit) |
| status | `To Do` (creation default — do not transition) |
| Story point estimate | **not set** — the team writes `Point:` in the description instead |
| Sprint | not set — PM pulls the card into a sprint |

## Workflow

### 1. Check the guard

§Guard rule 1. Not an imperative create request → answer the question instead and stop.

### 2. Resolve the input

Combine whatever is present:

- **Free text in args** → the requirements themselves.
- **Slack permalink** (`https://<ws>.slack.com/archives/<CHANNEL>/p<DIGITS>`) → parse
  `channel_id` + ts (insert a dot 6 digits from the end, drop the leading `p`; prefer
  `?thread_ts=`/`&cid=` when present — same parsing as [`ef-daily-report`](../ef-daily-report/SKILL.md) §5).
  Read the thread (`mcp__slack-mcp__conversations_replies`, else
  `mcp__claude_ai_Slack__slack_read_thread`) → feeds `**Context:**` and adds
  `* Slack thread: <url>` to `**Reference:**`.
- **Empty args** → the current conversation: what was just discussed/decided is the source.
  Say in one line which part you used, so a wrong read is visible in the echo.

### 3. Resolve the epic + read its name

Epic key from `--epic`, else an `UP-\d+` in the input that is an Epic, else ask once
(`AskUserQuestion`, offer the epics of the user's recent cards:
`assignee = currentUser() ORDER BY updated DESC` → distinct `fields.parent`).

`getJiraIssue` on the epic → its summary supplies the feature tag for the summary line.

### 4. Split into cards

One deliverable → one card. Split when the request lists distinct deliverables (numbered /
bulleted / "tách thành N card") — each gets its own summary, Tasks and AC, all under the same
epic. `--prefix=S` numbers them `[S1]`, `[S2]`, … in request order. Cap 10 (§Guard 2).

### 5. Create

Per card, in order:

```
mcp__claude_ai_Atlassian__createJiraIssue
  cloudId: "everfit.atlassian.net"
  projectKey: "UP"
  issueTypeName: "Task" | "Bug" | ...
  summary: "[API][Data Migration] Filter clients on migrate by coach selection"
  description: <the Family A body>       # contentFormat: "markdown" (default)
  contentFormat: "markdown"
  assignee_account_id: <accountId>
  additional_fields: {
    parent: { key: "UP-73605" },
    priority: { name: "Medium" },
    fixVersions: [{ name: "To be confirmed" }]
  }
```

`parent` is on UP's Task create screen (verified), so the epic link lands at creation — no
follow-up edit. If a create still rejects `parent`, create without it and `editJiraIssue` the
parent in; report that it happened.

Stop at the first error (§Guard 3) and report which cards were already created.

### 6. Report

Per created card: `UP-XXXXX — <summary>` + `https://everfit.atlassian.net/browse/UP-XXXXX`,
then the description as sent (§Guard 4). Finally print — do not run — the follow-up:

```
/rk:ef-branch-name UP-XXXXX
```

## Notes

- Format source: the team's own engineering cards (UP-74030, UP-74029, UP-73687, UP-73676).
  Cards written by QA (UP-75554) use `## Context` / `## Requirements` and carry no AC — that is
  deliberately NOT what this skill emits.
- `Point` lives in the description on purpose. The `Story point estimate` field exists on the
  create screen; the team does not use it.
- Do not transition the new card. It belongs in `To Do` until someone starts it.
- The Slack bot (`slack-claude-bot`) has its own `@bot card` command that produces the same
  format through the Jira REST API. Not because MCP is unavailable there — it is reachable even
  in a headless run (measured) — but because that path reads untrusted Slack thread text and
  must not hold a Jira write tool. Keep the two formats in sync.
