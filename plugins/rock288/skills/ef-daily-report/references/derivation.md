# Daily report — Jira/worklog derivation

How to build each report section from Jira (Atlassian MCP, `everfit.atlassian.net`).
Read pattern mirrors [`branch-name`](../../ef-branch-name/SKILL.md): `getJiraIssue` for
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

Both are coarse pre-filters, widened to cover the tz skew, then bucketed precisely (below).
**Both must be assigned to me** — a card I logged work on (or created) but that is assigned to
someone else is excluded.

**DONE YESTERDAY** — cards that entered QA Ready around the target day:
```
assignee = currentUser() AND status CHANGED TO ("QA Ready") DURING ("<date-1>", "<date+2>")
```
`fields: ["summary","status","parent"]`. Verified 2026-11-05: returns the cards moved in the
window (the DURING dates run in the account tz, hence the widening).

**PROGRESS CHANGED** — cards I logged time on around the target day:
```
worklogAuthor = currentUser() AND assignee = currentUser()
  AND worklogDate >= "<date-1>" AND worklogDate < "<date+2>"
```

**PLAN FOR TODAY** (unfinished work first, then my To Do queue — the report shows **max 5**,
see assembly rules):
```
assignee = currentUser() AND status = "In Progress" ORDER BY updated DESC
assignee = currentUser() AND status = "To Do" ORDER BY updated DESC
```

> Do NOT filter by `sprint in openSprints()` — cards often sit outside an open sprint and the
> query silently returns nothing. Request only the fields the report needs (`summary`,
> `status`, `parent`, `timetracking`); the default field set can blow past MCP response limits
> on large backlogs.

Use `currentUser()` by default. Only pass an explicit `accountId` (from config
`jira_account`) when reporting on behalf of someone else.

## Precise VN-day bucketing (the accuracy step)

### QA Ready moves → DONE YESTERDAY

For each DONE candidate: `getJiraIssue { fields: ["status","summary","parent"], expand:
"changelog" }` (verified 2026-11-05 on CHAL-1003). In `changelog.histories[]` keep the
histories that hold an item `field == "status"` with `toString == "QA Ready"`; convert each
history `created` (e.g. `2026-11-05T00:58:17.445-0800`) to Asia/Saigon. The card is **DONE**
when any of them falls on `--date` (`movedTarget = true`). If `changelog.total >
changelog.maxResults`, the inline list is truncated — read the rest before deciding (discover
the issue-changelog read on the Atlassian server).

Only the move matters: the card is DONE even with no worklog that day, and even if it left QA
Ready afterwards (that is the next day's report).

### Worklogs → PROGRESS CHANGED

The widened worklog JQL returns *candidate* cards. For each candidate, fetch its worklog
(`getJiraIssue` with `worklog` field), then for every worklog entry authored by the user:
1. Read `started` (carries a tz offset, e.g. `2026-05-31T16:20:06-0700`).
2. Convert to Asia/Saigon (UTC+7).
3. Keep the entry only if its VN calendar date == target `--date`.

`loggedTarget` (per card) = Σ `timeSpentSeconds` of the kept entries. A card belongs in
PROGRESS CHANGED **only if `loggedTarget > 0` and `movedTarget` is false** (a card moved to QA
Ready on `--date` is DONE only). `loggedAfter` (per card) = Σ `timeSpentSeconds` of worklogs by
**any** author started after the window — it only matters for a past `--date`; read it with
`executeRead listJiraIssueWorklogs { issueIdOrKey, startedAfter: <window end ms> }` (the
inline `worklog` list caps at 20). This is what
makes `--date` mean "the VN working day" regardless of the Jira account tz.

## Per-card fetch (`getJiraIssue`)

Pull:
- `fields.summary` → **Task name**
- `fields.parent.fields.summary` (or Epic link summary) → **Product Item Name**
- `fields.timetracking.timeSpentSeconds` → `timeSpent`
- `fields.timetracking.remainingEstimateSeconds` → `remaining_now`
- `fields.worklog.worklogs[]` → dated entries `{ started, timeSpentSeconds, comment }`

> If the inline `worklog` field is truncated/paginated, fetch the issue's worklog
> explicitly (dedicated worklog read) before computing the delta.

## Progress %

- **DONE YESTERDAY** → always `100%` (the card reached QA Ready that day). No time math.
- **PROGRESS CHANGED** → from time tracking, **capped at 90%**: the card was not finished on
  `--date`, whatever its status is now (it may have reached QA Ready later). `remaining_now == 0`
  prints `90%`, never `100%`. The cap applies to `before%` and `now%` alike.
- `n/a` only when **both** `timeSpent == 0` and `remaining_now == 0` → print
  `Progress: n/a (no time tracked)` and skip the delta for that card.

## Delta (no state file — reconstruct from dated worklogs)

```
loggedTarget = Σ timeSpentSeconds of my worklog entries bucketed into the VN target day
spentAtEnd   = timeSpent_total − loggedAfter          (time spent by the end of --date)
denominator  = timeSpent_total + remaining_now
before% = min((spentAtEnd − loggedTarget) / denominator, 90%)
now%    = min( spentAtEnd                 / denominator, 90%)
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
| Progress 100% | DONE YESTERDAY only (moved to QA Ready on `--date`); PROGRESS CHANGED caps at 90% |
| Reason (PROGRESS CHANGED) | `logged <Xh Ym>, <status>` (e.g. `logged 3h30m, In Review`). Append the worklog comment if present. |
| Remaining (text) | if not 100%: derive from `remaining_now` (e.g. `~Xh remaining`); append latest worklog comment if present |

## Section assembly rules

- **DONE YESTERDAY** — **cards moved to QA Ready on `--date`** (`movedTarget`), grouped by
  Product Item. Each card: bullet with task name + `Progress: 100%`. Logged time is not
  required.
- **PROGRESS CHANGED** — every card where `loggedTarget > 0` **and not `movedTarget`**, with
  its `before% → now%` delta. A card that logged time and moved to QA Ready the same day is in
  DONE YESTERDAY only, never in both sections. Print `None` only when no such card exists.
  - `now% > before%` → `Progress: X% → Y%` + `Reason: logged <time>, <status>` (no comment needed)
    + `Remaining:` derived from `remaining_now` (+ comment if any).
  - `now% == before%` (logged time but % flat, e.g. remaining grew) → `Progress: Still X%` +
    `Reason: logged <time>, remaining unchanged` (+ comment if present).
- **PLAN FOR TODAY** — **max 5 in the report**. Selection priority: (1) my `In Progress`
  cards (unfinished work carries over), (2) To Do cards whose Epic/parent matches a
  DONE/PROGRESS card of the target day (current work context), (3) then most recently
  updated. Cards in review / QA (`In Review`, `QA*`) are not plan items. Skip epic-level /
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

- No QA Ready move on `--date` → DONE YESTERDAY `None`; no worklog on `--date` → PROGRESS
  CHANGED `None`.
- Card moved to QA Ready twice on `--date` (QA Failed and back) → listed once.
- Card already in QA Ready before `--date` that logged time on `--date` (a fix after QA) → not
  moved that day → PROGRESS CHANGED, capped at 90%.
- Card with no Epic/parent → group under its own summary (or "Unassigned item").
- `--date` crossing a weekend → still a single-day window; user can widen via repeated runs.
- A card appearing in both PROGRESS CHANGED and the plan queries → list it in PROGRESS for
  yesterday and again under PLAN if still `In Progress` / `To Do`.
