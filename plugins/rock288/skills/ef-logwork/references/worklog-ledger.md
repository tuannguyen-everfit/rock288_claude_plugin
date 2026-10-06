# Worklog ledger — my worklogs per VN day

Shared by the log flow (step 3: "already logged today", duplicates, start-time chaining) and
`--audit`. Read-only. `cloudId` = `everfit.atlassian.net` on every call.

## Why not just JQL `worklogDate`

JQL `worklogDate` runs in the Jira **account** tz (`America/Los_Angeles`, ~14h behind VN), and
`started` comes back with a `-0700`/`-0800` offset. A VN morning (`09:51 +07:00`) is the
previous LA evening (`19:51 -0700`). So JQL is only a coarse pre-filter; the precise filter is
`started` as an absolute instant against the VN window. Same rationale as
[`ef-daily-report` derivation](../../ef-daily-report/references/derivation.md) — read it, do
not edit it.

## Procedure (range `from..to`, both VN dates; single day → `from = to`)

1. **Me** — `atlassianUserInfo` once → `account_id`.
2. **Window** — `startMs = Date.parse("<from>T00:00:00+07:00")`,
   `endMs = Date.parse("<to+1>T00:00:00+07:00")` (half-open). One VN day = 86 400 000 ms.
3. **Candidate cards** — `searchJiraIssuesUsingJql`:
   ```
   worklogAuthor = currentUser() AND worklogDate >= "<from-1>" AND worklogDate < "<to+2>"
   ```
   `fields: ["summary","status","issuetype"]`, `maxResults: 100`, follow `nextPageToken`
   until `isLast`. Keep `issuetype.name` + `status.statusCategory.key` for validation.
4. **Worklogs per card** — preferred:
   `mcp__claude_ai_Atlassian_MCP__executeRead { name: "listJiraIssueWorklogs", cloudId,
   inputs: { issueIdOrKey, startedAfter: startMs, startedBefore: endMs } }` — the server
   applies the exact VN window. Page with `startAt` while `startAt + maxResults < total`.
   Keep entries with `author.accountId == me` (shared cards hold the whole team's logs).
   To trim the payload pass `responseFields: ["total","worklogs.id","worklogs.author.accountId",
   "worklogs.timeSpentSeconds","worklogs.started","worklogs.comment"]` — paths are relative
   to `data`. **Never prefix them with `data.`**: that returns `{"data":{}}`, which reads
   exactly like "no worklogs" and silently drops entries (verified 2026-10-06). A `{}` with no
   `total` key = wrong paths, not an empty card.

   **Fallback** (that server/tool not installed): `getJiraIssue { fields: ["worklog"] }` →
   `fields.worklog.worklogs[]`; convert each `started` to an instant and keep
   `startMs <= t < endMs` + author == me. The inline list caps at 20 — if
   `worklog.total > worklog.maxResults`, warn that the card's ledger may be incomplete.
5. **Entry** — `{ card, date, startedVN, minutes, comment, worklogId }`:
   - `t = Date.parse(started)`; `startedVN` = `t` rendered at +07:00 (`HH:MM`);
     `date` = VN calendar date of `t`.
   - `minutes = timeSpentSeconds / 60`; block = `[t, t + minutes)`.
   - `comment` as returned (markdown); empty → `""`.

Calls in step 4 are independent — issue them in parallel.

## Derived values

| Value | Definition |
|---|---|
| day total | Σ minutes of entries with that `date` |
| per-card day total | same, grouped by `card` |
| last block end | max(`t + minutes`) of the day's entries — chaining anchor for new worklogs |
| duplicate | new item with the same `card` and the same normalized description (case-insensitive, dashes normalized) as a ledger entry that day → dropped unless the user insists |
| possible duplicate | same `card`, and the ledger comment maps (keyword table in `format-rules.md`) to the same Activity + default What — e.g. new `Ceremony – Daily standup` vs logged `daily meeting` → kept, warned |

## Start-time placement for new worklogs (log flow step 8)

Jira only needs the right **date**, but non-overlapping blocks keep the PC dashboard readable.

1. `cursor = max(<date>T<day_start>+07:00, last block end)`.
2. For each new item in draft order: `start = cursor`, `cursor = start + minutes`.
3. If a block would end after `<date+1>T00:00+07:00`, place it instead at the earliest
   free gap ≥ `day_start` that fits; if none fits, start it at `day_start` (overlap is allowed
   by Jira — the VN date is what matters) and say so in the draft.
4. Send `started` as `<date>T<HH:MM>:00.000+0700` — explicit `+0700`, never `Z`, never
   omitted (omitted = "now" in the account tz = wrong day after 17:00 LA).
