---
name: ef-cards
description: "List the Everfit Jira cards you have right now, grouped by epic: open cards assigned to you, the ones still on you listed by epic (priority first), the ones waiting on QA (QA Ready, Q&A, In Test, QA Completed) only counted unless --all-statuses. Fetches through Atlassian MCP. Read-only. Triggers on: 'my cards', 'card của tôi', 'đang có card gì', 'card todo', 'list card theo epic', 'xem card'."
argument-hint: "[--project=CHAL] [--all-statuses] [--jql=\"...\"]"
metadata:
  author: rock288
  version: "1.0.0"
---

# EF Cards

What is on your plate, by epic, in one call.

**Read-only.** No Jira writes.

**Cloud id:** `everfit.atlassian.net` on every Atlassian MCP call.
**`$SKILL_DIR`** = the "Base directory for this skill" path printed when this skill loads.

## Flags

| Flag | Default | Effect |
|---|---|---|
| `--project=KEY` | `CHAL` | Jira project to load. |
| `--all-statuses` | off | Also list the cards waiting on QA (`QA Ready`, `Q&A`, `In Test`, `QA Completed`); by default they are only counted. |
| `--jql="..."` | — | Replace the whole JQL, e.g. another assignee. Keep `issuetype != Epic` in it: epics are the groups, not cards. |

Default JQL:

```
project = <KEY> AND assignee = currentUser() AND statusCategory != Done
AND issuetype != Epic AND issuetype not in subTaskIssueTypes() ORDER BY updated DESC
```

## Workflow

1. **Fetch** — `searchJiraIssuesUsingJql` with
   `{ cloudId: "everfit.atlassian.net", jql, maxResults: 100,
   fields: ["summary","status","parent","priority","issuetype"] }`.
   Page with `nextPageToken` = the previous page's `issues.pageInfo.endCursor` while
   `hasNextPage` is true; stop at 10 pages and say the list is truncated.
2. **Keep each page as a file, do not read it.** A large result is saved by the tool to a file
   whose path it prints: use that path. A small result comes back inline: Write it verbatim
   to the scratchpad as `ef-cards-page-<n>.json`. Never load page files into context — the
   script parses them.
3. **List** —
   ```bash
   node "$SKILL_DIR/scripts/list-cards.cjs" [--all-statuses] <page files…>
   ```
   It prints the cards grouped by epic (epics by key, cards by priority then key), cards
   without an epic last, and a `hidden: N with QA` count.
4. **Reply** (Vietnamese, tech terms in English): one table per epic
   (`Card | Status | Priority | Nội dung`), the summary shortened; the hidden QA count as one
   sentence; then one line naming the Highest / High cards and anything in `Need Review`.

## Files

- `scripts/list-cards.cjs` — merges the pages and prints the report. Test: `node scripts/list-cards.test.cjs`.
