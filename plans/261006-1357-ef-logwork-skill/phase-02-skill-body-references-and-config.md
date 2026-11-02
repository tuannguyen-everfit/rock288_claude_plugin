---
phase: 2
title: "Skill body references and config"
status: completed
effort: 3h
---

# Phase 2 — SKILL.md, references, config (log flow)

## Context Links
- [plan.md](./plan.md) · Phase 1 JSON contract
- Precedents: `skills/ef-daily-report/SKILL.md` (flags table, config, Variant-B draft→confirm, VN tz), `skills/ef-jira-card/SKILL.md` (Guard section, sequential writes, echo)
- Guideline: Confluence 3891494970 §2 rules, §4 shared cards, §5 description format, §10 anti-patterns

## Overview
Priority P1. Write the skill itself: flags, log flow, format rules, config, worklog read path shared with Phase 3.

## Key Insights
- Two Atlassian MCP servers may be installed: `mcp__claude_ai_Atlassian__*` (has `addWorklogToJiraIssue`, `getJiraIssue`, `searchJiraIssuesUsingJql`) and `mcp__claude_ai_Atlassian_MCP__*` (`executeRead listJiraIssueWorklogs` with `startedAfter/Before`). Prefer the latter for reads (exact VN window server-side); fall back to `getJiraIssue fields=[worklog]` + client bucketing.
- No delete-worklog tool → draft→confirm is the safety net; echo `worklogId` so mistakes are editable.
- Jira account tz = `America/Los_Angeles`; always send `started` with `+0700`.

## Requirements
Functional:
- Flags: `[free text]`, `--date=YYYY-MM-DD` (VN, default today), `--yes`, `--shared=UP-xxxxx`, `--no-git`, `--dry-run`, `--audit[=from..to]` (body in Phase 3).
- Suggest → user hours → normalize → validate → draft → confirm → write → echo.
Non-functional: SKILL.md ≤ ~200 lines; details in references.

## Architecture — log flow (goes into SKILL.md)
1. **Config** — read `memory/logwork.md`. Missing fields → ask once (`AskUserQuestion`), write file (skip on `--dry-run`).
2. **Shared card** — `--shared` wins (save to config). Else JQL `project = UP AND issuetype = Epic AND summary ~ "\"General Task - Sprint\"" AND summary ~ "<shared_epic_squad>" ORDER BY created DESC`, `maxResults 1`, fields `summary,status`. Result ≠ config → ask once "Sprint mới: <key> <summary> — dùng card này?" → save. JQL empty/error → config value + one-line warning.
3. **Collect** (skip git on `--no-git`): `node <skill>/scripts/git-activity.cjs --date=<d> --roots=<repo_roots>` → JSON. Day ledger: existing worklogs of the VN day (see `references/worklog-ledger.md`).
4. **Suggest** — table: card · summary (one `searchJiraIssuesUsingJql key in (…)` fields `summary,status,issuetype`) · proposed desc · `? h`; plus `đã log hôm nay: Xh` rows from ledger. If args carried free text → skip asking; else ask user to reply with hours + extra items (plain chat reply, not AskUserQuestion).
5. **Normalize** per `references/format-rules.md`: durations → 15m; keyword → activity + shared card; desc `Activity – What – Outcome`; `Dev` vs `Bug fix` by Jira issuetype; review entries → `Review – Code review PR #N (<repo>) – <state>` on PR's card.
6. **Validate** (warn, never block): regex; generic What blocklist; card status Done/Closed/WILL NOT FIX; per-card day total (ledger + new) ≥ 8h; day total < `daily_min`; duplicate (same card + desc already in ledger) → drop unless user insists; weekend date → warn.
7. **Draft** — rendered markdown table (card link / time / desc / started) + `Total: new Xh + existing Yh = Zh / 7h`. Wait for OK/edits. `--yes` skips; `--dry-run` stops here.
8. **Write** sequentially: `addWorklogToJiraIssue { cloudId: "everfit.atlassian.net", issueIdOrKey, timeSpent: "1h 30m", started: "<d>T<HH:MM>:00.000+0700", commentBody, contentFormat: "markdown" }`. Start = max(09:00, end of last ledger block); each next block starts where previous ended. Stop at first error; 403 → stop + ask (never re-route to shared card).
9. **Echo** — card · time · desc · worklogId, then final day total.

## Related Code Files
Create (all under `plugins/rock288/skills/ef-logwork/`):
- `SKILL.md`
- `references/format-rules.md`
- `references/worklog-ledger.md`
- `memory/logwork.md`

## Implementation Steps
1. `SKILL.md` frontmatter:
   ```yaml
   name: ef-logwork
   description: "Log Everfit Jira worklogs in the Core Team format ([Activity] – [What] – [Outcome], 15m steps, VN date) from today's git commits + PR reviews. Suggests cards and descriptions, you type the hours, shows a draft with the daily total vs 7h, then logs on confirm. --audit reports days under 7h, empty days and badly formatted worklogs (read-only). Triggers on: 'logwork', 'log work', 'log time', 'timesheet', 'log giờ', 'chấm công', 'audit worklog'."
   argument-hint: "[free text e.g. '3h UP-79399, 15m standup'] [--date=YYYY-MM-DD] [--yes] [--shared=UP-XXXXX] [--no-git] [--audit[=from..to]] [--dry-run]"
   metadata:
     author: rock288
     version: "1.0.0"
   ```
   Body sections: purpose + IMPORTANT (only worklogs; never edits cards/old worklogs) · Flags table · Rules at a glance (from guideline §2) · Workflow 1–9 above · Audit (stub → Phase 3) · Notes (Jira profile tz tip, no delete tool).
2. `references/format-rules.md`:
   - Activity vocab (exact spelling): `Dev`, `QA`, `Review`, `Bug fix`, `Ceremony`, `Meeting`, `Support`, `Learning`, `Leave`.
   - Separator ` – ` (U+2013, spaces both sides). Validation regex:
     `^(Dev|QA|Review|Bug fix|Ceremony|Meeting|Support|Learning|Leave) – \S.{2,}?( – \S.*)?$`
   - Generic-What blocklist (case-insensitive, whole What): `coding, code, dev, meeting, test, testing, review, fix, fix bug, bug, support, work, task, learning`.
   - Keyword → activity (+ shared card when no card given):
     | keywords | Activity | Default What |
     |---|---|---|
     | standup, daily | Ceremony | Daily standup |
     | planning, refinement, grooming, retro, demo, review sprint | Ceremony | Sprint <n> <keyword> |
     | sync, 1:1, họp, meeting | Meeting | <user text> |
     | support, CS, hỗ trợ | Support | <user text> |
     | learn, training, onboarding, đọc tài liệu | Learning | <user text> |
     | off, nghỉ, leave, phép | Leave | Annual leave (approved) |
   - Card-based: issuetype Bug → `Bug fix`; else `Dev`; reviews → `Review`. Feature-specific meeting with a card ID → `Meeting` on that card (guideline §4 rule of thumb).
   - What from git: first 1–2 `subjects` joined `; `, ≤ 90 chars, capitalized. Outcome: `mergedPrs` → `PR #N merged`; review state → `approved` / `changes requested` / `commented`; else omitted.
   - Duration parse: `1h30m`, `1h 30m`, `1.5h`, `1,5h`, `90m`, `0.25h` → minutes → round to nearest 15 (ties up, min 15) → Jira string `Xh Ym`. Show `50m→45m` in draft when rounded.
   - ✅/❌ example table copied from guideline §5.
3. `references/worklog-ledger.md` — reading one or more VN days of *my* worklogs:
   - Window: `[d 00:00+07:00, d+1 00:00+07:00)` → epoch ms.
   - Candidates: JQL `worklogAuthor = currentUser() AND worklogDate >= "<from-1>" AND worklogDate < "<to+2>"` (widened for LA account tz), fields `summary,status,issuetype`, paginate.
   - Per card: `executeRead listJiraIssueWorklogs { issueIdOrKey, startedAfter, startedBefore }` → keep `author.accountId == me` (`atlassianUserInfo` once). Fallback: `getJiraIssue fields=["worklog"]`, convert each `started` to +07:00, bucket.
   - Output per entry: `{ card, date, startedVN, minutes, comment, worklogId }`; block end = started + minutes.
   - Link `/rk:ef-daily-report` `references/derivation.md` for the tz rationale (do not edit that file).
4. `memory/logwork.md` (shipped defaults):
   ```
   # logwork config
   - shared_card: UP-80126            # General Task - Sprint 18-26 - Squad Platform&Capability and Integration
   - shared_epic_squad: Platform       # substring used by the JQL in step 2
   - repo_roots: ~/Source
   - daily_min_hours: 7                # PC 2026-10-06; guideline std 8h, target ≥80%
   - max_card_hours_per_day: 8
   - day_start: "09:00"
   - report_timezone: Asia/Saigon      # +07:00
   - jira_timezone: America/Los_Angeles
   ```
5. Dry-run on today: `/rk:ef-logwork --dry-run` → draft renders, nothing written.

## Todo List
- [x] SKILL.md frontmatter + flags + workflow
- [x] references/format-rules.md
- [x] references/worklog-ledger.md
- [x] memory/logwork.md
- [x] dry-run renders a correct draft for 2026-10-06
- [ ] one real 15m test log on the shared card (manual follow-up, no delete-worklog tool)

## Success Criteria
- Draft for a sample input `3h UP-79399, 2h UP-79336, 15m standup, 1h sync BE` shows 4 rows, standup + sync on shared card, every desc passes regex, total + 7h warning correct. ✅
- `started` values chained from 09:00 +0700 with no overlap with ledger blocks. ✅
- One real 15m test log on the shared card succeeds and shows in Jira on the correct VN date (then edit it to the real entry rather than leaving noise). ⏸ (deferred — no delete-worklog tool; auto mode shouldn't write real worklogs)

## Implementation Notes

**Completed**: SKILL.md, references/format-rules.md, references/worklog-ledger.md, memory/logwork.md all written. Dry-run of the log flow done against live Jira for 2026-10-06 (ledger 5 entries 5h45m read correctly, last block end 12:00 VN, sample draft descriptions pass regex).

**Deviations from spec**:
- Shared-epic JQL changed to `summary ~ "General Task" AND created >= -60d` + client-side `General Task - Sprint` prefix + squad substring filter, because Jira tokenizes `Platform&Capability` as one word (original JQL returned 0 rows).
- Added: step 0 date via `TZ=Asia/Ho_Chi_Minh date +%F`, write guard for --dry-run/--audit, `--yes` only auto-confirms zero-warning drafts.
- What fallback = card summary minus [Tag]s.
- Added "possible duplicate" warning when same card+desc already in ledger.
- responseFields `data.` prefix gotcha documented.
- New config key `card_projects` for project allowlist.

## Risk Assessment
- `listJiraIssueWorklogs` not available in a user's MCP set → fallback documented.
- Free-text parse ambiguity (`1h UP-1 UP-2`) → ask instead of guessing.
- Card not visible / 403 → stop, report, no auto-reroute.

## Security Considerations
- No credentials in config; Jira auth = MCP session. Worklog visibility left default (no `visibility` param).

## Next Steps
Phase 3 adds `--audit` on top of `worklog-ledger.md`.
