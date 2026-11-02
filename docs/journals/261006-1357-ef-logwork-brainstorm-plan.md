# 2026-10-06 — ef-logwork: brainstorm + plan

**Trigger:** PC audited sprint 18-26 timesheets. Tuan had 54h of 70h, two empty days, and one worklog that landed on Saturday because of timezone. Core Team guideline (Confluence 3891494970) now requires `[Activity] – [What] – [Outcome]`, 15m steps, the correct VN date, and at least 7h/day.

**Decisions:** log + read-only `--audit`; git commits + PR reviews suggest the card and desc while the user types the hours (no padding); draft → confirm, with `--yes` to skip; shared card UP-80126 kept in config and re-checked with one JQL per run.

**Findings worth remembering:**
- Jira account tz = `America/Los_Angeles`, so UI logs drift onto the next VN day. The skill sends `started` with an explicit `+0700`. Separately, change the profile tz.
- Atlassian MCP can add and edit worklogs but **cannot delete** them. That is why the confirm gate exists.
- `gh search prs --reviewed-by=@me --updated=X` returns PRs *touched* on X, not PRs *reviewed* on X. Need `pulls/{n}/reviews` filtered by `submitted_at`.
- The PC's Chrome extension already handles manual logging. The skill is only worth building for the suggestions it pulls from git/PRs.

**Artifacts:** `plans/reports/brainstorm-261006-1357-ef-logwork-skill.md`, `plans/261006-1357-ef-logwork-skill/` (4 phases, ~8h). No code changed yet.
