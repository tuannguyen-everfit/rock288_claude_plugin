# Daily report — Jira/worklog derivation

How to build each report section from Jira (Atlassian MCP, `everfit.atlassian.net`).
Read pattern mirrors [`branch-name`](../../branch-name/SKILL.md): `getJiraIssue` for
fields, `searchJiraIssuesUsingJql` for lists.

## Day window — Vietnam time (Asia/Saigon)

The report day is bucketed in **Asia/Saigon (UTC+7)**, the user's working day — NOT the Jira
account timezone. `--date=<YYYY-MM-DD>` overrides (default = yesterday VN); the window is
`[date 00:00 +07:00, date+1 00:00 +07:00)` in absolute (UTC) terms.

> The report **header date** is always **today** (posting day, Asia/Saigon) — `--date` only
> selects which worklog day feeds DONE / PROGRESS CHANGED, never the header.

> **Why this matters:** JQL `worklogDate` is evaluated in the **Jira instance/account
> timezone** (here `America/Los_Angeles`, UTC−7/−8), which is ~14h behind VN. So a JQL
> `worklogDate = <VN date>` filter does NOT line up with the VN day — it would silently
> drop or misassign entries. We therefore filter precisely on each worklog's `started`
> timestamp converted to VN, and use JQL only as a coarse pre-filter.

## JQL queries

**DONE + PROGRESS CHANGED** — coarse pre-filter, widened ±1 day to cover the tz skew, then
bucket precisely (below). **Must also be assigned to me** — a card I logged work on (or
created) but that is assigned to someone else is excluded:
```
worklogAuthor = currentUser() AND assignee = currentUser()
  AND worklogDate >= "<date-1>" AND worklogDate < "<date+2>"
```

**PLAN FOR TODAY** (my To Do queue — the report shows **max 5**, see assembly rules):
```
assignee = currentUser() AND status = "To Do" ORDER BY updated DESC
```

> Do NOT filter by `sprint in openSprints()` — cards often sit outside an open sprint and the
> query silently returns nothing. Request only the fields the report needs (`summary`,
> `status`, `parent`, `timetracking`); the default field set can blow past MCP response limits
> on large backlogs.

Use `currentUser()` by default. Only pass an explicit `accountId` (from config
`jira_account`) when reporting on behalf of someone else.

## Precise VN-day bucketing (the accuracy step)

The widened JQL returns *candidate* cards. For each candidate, fetch its worklog
(`getJiraIssue` with `worklog` field), then for every worklog entry authored by the user:
1. Read `started` (carries a tz offset, e.g. `2026-05-31T16:20:06-0700`).
2. Convert to Asia/Saigon (UTC+7).
3. Keep the entry only if its VN calendar date == target `--date`.

`loggedTarget` (per card) = Σ `timeSpentSeconds` of the kept entries. A card belongs in
DONE/PROGRESS **only if `loggedTarget > 0`** after this filter. This is what makes `--date`
mean "the VN working day" regardless of the Jira account tz.

## Per-card fetch (`getJiraIssue`)

Pull:
- `fields.summary` → **Task name**
- `fields.parent.fields.summary` (or Epic link summary) → **Product Item Name**
- `fields.status.name` → done detection (`Done` / `Closed` / `Resolved` → 100%)
- `fields.timetracking.timeSpentSeconds` → `timeSpent`
- `fields.timetracking.remainingEstimateSeconds` → `remaining_now`
- `fields.worklog.worklogs[]` → dated entries `{ started, timeSpentSeconds, comment }`

> If the inline `worklog` field is truncated/paginated, fetch the issue's worklog
> explicitly (dedicated worklog read) before computing the delta.

## Progress %

```
progress% = timeSpent / (timeSpent + remaining_now)
```
- `100%` when status is a done-state OR `remaining_now == 0`.
- `n/a` only when **both** `timeSpent == 0` and `remaining_now == 0` → print
  `Progress: n/a (no time tracked)` and skip the delta for that card.

## Delta (no state file — reconstruct from dated worklogs)

```
loggedTarget = Σ timeSpentSeconds of worklog entries bucketed into the VN target day
before% = (timeSpent_total − loggedTarget) / (timeSpent_total + remaining_now)
now%    =  timeSpent_total                 / (timeSpent_total + remaining_now)
delta   =  loggedTarget / (timeSpent_total + remaining_now)
```

Denominator is constant because logging time is assumed to decrement remaining 1:1
(standard Jira time-tracking behavior). When `loggedTarget == 0` the card has no
delta → it belongs in PLAN FOR TODAY, not PROGRESS CHANGED.

## Field → report mapping

Worklog **comments are NOT required**. The % delta is computed purely from logged time;
`Reason` / `Remaining` are derived from time + status, and only enriched by a comment if one exists.

| Report field | Source |
|---|---|
| Product Item Name | card Epic/parent `summary` (fallback: card's own summary, or "Unassigned item") |
| Task name | card `summary` + linked card ID `[UP-XXXXX](https://everfit.atlassian.net/browse/UP-XXXXX)` |
| Progress 100% | done-state status, or `remaining_now == 0` |
| Reason (PROGRESS CHANGED) | `logged <Xh Ym>, <status>` (e.g. `logged 3h30m, moved to QA READY`). Append the worklog comment if present. |
| Remaining (text) | if not 100%: derive from `remaining_now` (e.g. `~Xh remaining`); append latest worklog comment if present |

## Section assembly rules

- **DONE YESTERDAY** — group cards by Product Item. Each card: bullet with task name +
  `Progress: X%`. If not 100%, add `Remaining:` derived from `remaining_now` (+ comment if any).
- **PROGRESS CHANGED** — **every** card where `loggedTarget > 0`, with its `before% → now%`
  delta. This **includes cards that reached 100%**: they appear in BOTH sections (DONE shows
  the final %, PROGRESS CHANGED shows the delta + reason). Never print `None` here while any
  card logged time on the target day.
  - `now% > before%` → `Progress: X% → Y%` + `Reason: logged <time>, <status>` (no comment needed).
  - `now% == before%` (logged time but % flat, e.g. remaining grew) → `Progress: Still X%` +
    `Reason: logged <time>, remaining unchanged` (+ comment if present).
- **PLAN FOR TODAY** — cards from the To Do query, **max 5 in the report**. Selection
  priority when more than 5: (1) cards whose Epic/parent matches a DONE/PROGRESS card of the
  target day (current work context), (2) then most recently updated. Skip epic-level /
  placeholder rows (no real task summary). Tell the user in the chat draft how many To Do
  cards were left out so they can swap picks while editing. Put **each sub-field on its own
  line** (same as DONE YESTERDAY — never inline them). Emit markdown bullets, NOT `•`/`◦`
  glyphs (see SKILL.md "Report format"):
  ```
  <Product Item Name>
  - <task> ([CARD](url))
    - Progress: X% by EOD | Full task done: [date/EOD]
    - AI: None
  ```
  (`Progress` target inferred from remaining estimate; `AI` is `None` unless Claude is used — user edits in draft.)
- Any empty section → print `None`.
- **Every sub-field (Progress / Remaining / Reason / AI) is its own 2-space-indented `-` line**
  across all sections — never write two sub-fields on one line, and never use the `•`/`◦` glyphs.

## Edge cases

- No worklogs in window → DONE YESTERDAY and PROGRESS CHANGED both `None`.
- Card with no Epic/parent → group under its own summary (or "Unassigned item").
- `--date` crossing a weekend → still a single-day window; user can widen via repeated runs.
- A card appearing in both DONE-yesterday and the To Do query → list it in DONE/PROGRESS for
  yesterday and again under PLAN if still `status = To Do`.
