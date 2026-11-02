---
phase: 3
title: "Audit mode"
status: completed
effort: 1.5h
---

# Phase 3 — `--audit` (read-only)

## Context Links
- [plan.md](./plan.md) · `references/worklog-ledger.md` (Phase 2)
- Pain it targets (Slack thread 2026-10-06): 54h/70h logged, Mon/Thu empty, entries shifted onto Saturday by tz.

## Overview
Priority P2. One flag that reads a date range and reports compliance gaps before the PC dashboard does. Never writes.

## Requirements
- `--audit` → last 10 VN working days ending today (Mon–Fri). `--audit=YYYY-MM-DD..YYYY-MM-DD` explicit range (max 31 days).
- Read-only: no `addWorklogToJiraIssue` / `addOrEditJiraIssueWorklog` calls in this path.

## Architecture
1. Range → ledger (Phase 2 procedure) once for the whole range.
2. Per VN day: total minutes, per-card minutes, bad-format entries (regex + blocklist from `format-rules.md`).
3. Output (rendered markdown):
   ```
   | Ngày | Thứ | Logged | /7h | Ghi chú |
   |---|---|---|---|---|
   | 2026-09-29 | Mon | 0h | ❌ | ngày làm việc trống |
   | 2026-09-30 | Tue | 7h 15m | ✅ | |
   | 2026-10-02 | Thu | 5h | ⚠ | thiếu 2h |
   | 2026-10-03 | Fri | 8h | ⚠ | UP-79399 = 8h (≥8h/card) |
   | 2026-10-04 | Sat | 2h | ⚠ | weekend entry — lệch tz? |
   Tổng: 54h / 70h (77%) — target ≥80% của 8h/ngày = 64h
   ```
   Then `Sai format` list: date · card · time · current comment · suggested rewrite (text only).
   Then 1-line next actions: e.g. `/rk:ef-logwork --date=2026-09-29` for each empty/short day; 0h day may be leave → log `Leave – Annual leave (approved)` on shared card.
4. Expected = working days × `daily_min_hours`; also show guideline view (`× 8h × 80%`).

## Related Code Files
- Create `plugins/rock288/skills/ef-logwork/references/audit.md`
- Modify `plugins/rock288/skills/ef-logwork/SKILL.md` — replace Audit stub with 5–8 line summary linking `references/audit.md`

## Implementation Steps
1. Write `references/audit.md` (range rules, steps, table format, statuses ✅ ≥ min / ⚠ < min or ≥8h card or weekend / ❌ 0h on working day).
2. Update SKILL.md Audit section + flags row.
3. Run `/rk:ef-logwork --audit=2026-09-22..2026-10-06`; compare totals with PC's artifact numbers (54h before fix → current) — allow ≤15m/day diff.

## Todo List
- [x] references/audit.md
- [x] SKILL.md audit section
- [ ] real audit run cross-checked vs PC dashboard (manual follow-up, needs dashboard access)

## Success Criteria
- Audit for sprint 18-26 matches PC dashboard per day within 15m. ⏸ (deferred — needs dashboard access)
- Weekend + empty-day + ≥8h-card + bad-format cases all surface. ✅

## Implementation Notes

**Completed**: references/audit.md + SKILL.md audit section written.

**Deviation from spec**:
- Default `--audit` range = last 10 working days BEFORE today; explicit range including today shows today as ⏳ (not counted).

## Risk Assessment
- Public holidays counted as working days → user annotates; no holiday calendar (YAGNI).
- Large range → many `listJiraIssueWorklogs` calls → cap 31 days.

## Security Considerations
- Read-only path; only own worklogs (`author.accountId == me`).

## Next Steps
Phase 4.
