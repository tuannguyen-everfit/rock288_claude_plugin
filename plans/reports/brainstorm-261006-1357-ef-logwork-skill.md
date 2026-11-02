# Brainstorm — `ef-logwork` skill (log Jira worklog đúng format Core Team)

Date: 2026-10-06 · Source: Slack thread C0AN2P9BFS9/p1790917312243399 + Confluence 3891494970 (Timesheet Logging Guideline — Core Team)

## Problem

PC audit sprint 18-26: thiếu giờ (54h/70h), ngày làm việc trống, entry rơi sang ngày khác do tz (Jira profile = `America/Los_Angeles`), desc chung chung. Cần skill log worklog đúng rule, ít tốn công nhớ lại cả ngày.

## Rules (authoritative — guideline + thread)

| Rule | Value |
|---|---|
| Desc format | `[Activity] – [What] – [Outcome]` (en dash, Outcome optional) |
| Activity vocab | `Dev`, `QA`, `Review`, `Bug fix`, `Ceremony`, `Meeting`, `Support`, `Learning`, `Leave` |
| Unit | 15m steps (`30m`, `1h 15m`) |
| Date started | ngày làm thật, VN (GMT+7) — PC convert sang GMT+7 |
| Daily min | **7h** (PC, capacity 70h/10d); guideline 8h std, target ≥80%/sprint |
| Anti-pattern | 8h trên 1 card/ngày; batch cuối tuần; padding; desc 1 từ |
| Non-ticket work | log thẳng vào Epic **UP-80126** `General Task - Sprint 18-26 - Squad Platform&Capability and Integration` — không tạo card con |
| Feature meeting/review | log trên card liên quan, không phải shared |
| Overtime | log đúng giờ thật |

## Verified facts

- Atlassian MCP: `addWorklogToJiraIssue` / `addOrEditJiraIssueWorklog` (add+edit via `worklogId`), `listJiraIssueWorklogs` (`startedAfter/Before` ms → VN-day window chính xác). **Không có delete worklog.**
- Commits trong `~/Source/*` mang card ID trong subject (`fix(truecoach): UP-79399 ...`) + branch `dev_s18_26.<type>/<CARD>` → git suy ra card được.
- PC extension `JIRA Sprint View v4` đã có form log + chart + nhắc 17:30 → skill chỉ đáng làm nếu tự soạn entry từ git/PR.
- `ef-daily-report/references/derivation.md` đã có logic bucket VN-day (widened JQL + convert `started`) → reuse.
- rk hiện `4.2.2`; `ef-daily-report` category `utilities` trong `EXACT_CATEGORY_MAP`.

## Decisions

| # | Decision | Chosen | Rejected (why) |
|---|---|---|---|
| 1 | Scope | Log + `--audit` read-only | Log-only (phải chờ dashboard PC); auto-fix (sửa hàng loạt, no undo, nhu cầu 1 lần) |
| 2 | Input | Git/PR gợi ý card+desc, user nhập giờ + free text | Free-text only (≈ extension); full auto chia giờ (padding = anti-pattern) |
| 3 | Gate | Draft → confirm, `--yes` skip | Log ngay (không delete được) |
| 4 | Shared card | Config + JQL dò epic mới nhất mỗi run, hỏi khi đổi | Manual only (quên đổi → log nhầm sprint cũ) |

## Final design

### Layout
```
plugins/rock288/skills/ef-logwork/
├── SKILL.md                  # flags, flow, format rules summary
├── memory/logwork.md         # shared_card, shared_epic_pattern, repo_roots, daily_min=7h, report_tz, jira_tz
├── references/format-rules.md # activity vocab, regex, keyword→activity map, ✅/❌ examples
├── references/audit.md       # VN-day bucketing (ref ef-daily-report derivation), audit table
└── scripts/git-activity.cjs  # repo_roots × VN day → JSON [{card, repo, branch, commits[]}]
```

### Flags
`[free text]` · `--date=YYYY-MM-DD` (VN, default today) · `--yes` · `--audit[=from..to]` (default 10 working days) · `--shared=UP-xxxxx` (override + save) · `--no-git` · `--dry-run`

### Log flow
1. Load config; JQL `issuetype = Epic AND summary ~ "General Task - Sprint" AND summary ~ "Platform"` ORDER BY created DESC, limit 1 → != config → ask once, save. JQL miss → use config.
2. Collect:
   - `git-activity.cjs` — `git log --all --author=<email> --since/--until` with explicit `+0700`, card ID regex `[A-Z]+-\d+` from subject → branch fallback.
   - `gh search prs --reviewed-by=@me` updated on date → `Review – Code review PR #N (<repo>)` on PR's card.
   - Existing worklogs of day (widened JQL + `listJiraIssueWorklogs` VN window) → show "đã log Xh", detect dup (same card + desc).
3. Print suggestions (card + desc, `? h`); user replies hours + extra free text. Args free text → skip prompt.
4. Normalize: parse durations → round 15m (show `50m→45m`); keyword map (standup/planning/refinement/retro/demo → `Ceremony`; sync/1:1/meeting → `Meeting`; support/CS → `Support`; learn/training → `Learning`; off/leave/nghỉ → `Leave`) → shared card unless card given; desc `Activity – What – Outcome`, Outcome từ PR state (`PR opened` / `PR merged`) nếu có.
5. Validate (warn, not block): regex `^(Dev|QA|Review|Bug fix|Ceremony|Meeting|Support|Learning|Leave) – .+`; generic single-word What; card ≥8h/day; day total (incl. existing) <7h; card status Done/Closed.
6. Draft table (card / time / desc / total vs 7h) → confirm (skip `--yes`; stop `--dry-run`).
7. Write sequentially, stop on first error: `started = <date>T09:00:00.000+0700`, blocks chained back-to-back (start after last existing block end) → never cross VN midnight.
8. Echo worklogIds + day total.

### Audit flow (read-only)
JQL `worklogAuthor = currentUser() AND worklogDate >= <from-1> AND worklogDate < <to+2>` → per-card `listJiraIssueWorklogs` → bucket VN day → table per day: `logged / 7h ✅⚠`, empty working days, bad-format desc, card ≥8h/day. 0h day → hint log `Leave` vào shared card.

### Housekeeping
- Bump rk `4.2.2 → 4.3.0` (new skill) in BOTH `plugin.json` + `marketplace.json`.
- Add `"ef-logwork": "utilities"` to `EXACT_CATEGORY_MAP`; rerun `scan_skills.py`.
- Frontmatter `name: ef-logwork` (bare slug = folder).

## Risks

- Git ≠ duration → giờ luôn do user nhập; không auto-fill tới 7h.
- Log review lên card người khác có thể 403 → stop + ask, không tự đẩy sang shared.
- Shared epic naming [TO CONFIRM] → JQL có thể hụt → config fallback.
- No delete → sai chỉ edit được (worklogId echo).
- Logging giảm remaining estimate → ảnh hưởng progress % trong ef-daily-report (behavior chuẩn Jira, chấp nhận).
- Out of skill: đổi Jira profile tz → `Asia/Ho_Chi_Minh` để UI/extension không lệch ngày.

## Success metrics

- 0 entry sai format/regex trong sprint kế.
- Mỗi ngày làm việc ≥7h, log trong ngày.
- `--audit` khớp dashboard PC (sai lệch ≤15m/ngày).
- Thời gian log/ngày < 1 phút.

## Next steps

`/rk:plan` → phases: (1) `git-activity.cjs` + test, (2) SKILL.md + references + config, (3) audit mode, (4) version bump + category map + scan.

## Unresolved questions

- Danh sách shared card cuối cùng (guideline [TO CONFIRM]) — hiện chỉ 1 epic UP-80126 cho mọi non-ticket work.
- Min 7h vs 6h (họp trước nói 6h) — config `daily_min` để chỉnh.
- `--audit` range mặc định 10 ngày làm việc ≠ sprint thật; có lấy sprint start từ board không (`listJiraBoardSprints`) — để sau.
