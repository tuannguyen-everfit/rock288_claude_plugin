---
title: "ef-logwork skill — log Jira worklog đúng format Core Team"
description: "New rk skill /rk:ef-logwork: git/PR-suggested Jira worklogs in [Activity] – [What] – [Outcome] format, VN-day safe, draft→confirm, plus read-only --audit."
status: completed
priority: P2
effort: 8h
branch: main
tags: [feature, skill, jira]
blockedBy: []
blocks: []
created: 2026-10-06
---

# ef-logwork skill — log Jira worklog đúng format Core Team

## Overview

New skill `plugins/rock288/skills/ef-logwork/` → `/rk:ef-logwork`. Suggests today's entries from git commits + PR reviews (card + desc), user types hours, skill normalizes (15m, activity vocab, `Activity – What – Outcome`), validates (7h/day, ≤8h/card), shows draft → confirm → `addWorklogToJiraIssue` with explicit `+0700` `started`. `--audit` = read-only sprint gap report.

Source of truth: [brainstorm report](../reports/brainstorm-261006-1357-ef-logwork-skill.md) · Confluence 3891494970 "Timesheet Logging Guideline — Core Team" (last updated 2026-09-30) · Slack thread C0AN2P9BFS9/p1790917312243399 (shared epic UP-80126, min 7h/day).

## Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Scope | Log + read-only `--audit`; no auto-fix of old worklogs |
| D2 | Input | git commits + PR reviews suggest card/desc; hours always user-entered (no padding) |
| D3 | Gate | Draft → confirm; `--yes` skips; `--dry-run` never writes |
| D4 | Shared card | Config `shared_card` + 1 JQL/run for newest `General Task - Sprint` epic; ask on mismatch |
| D5 | Review detection | `gh api …/pulls/{n}/reviews` filtered by `submitted_at` in VN day — `gh search --updated` alone returns PRs touched that day, not reviewed that day (verified 2026-10-06) |
| D6 | `started` | `<date>T09:00:00.000+0700`, blocks chained back-to-back after last existing block → never crosses VN midnight |
| D7 | Config location | `memory/logwork.md` inside skill folder (sibling precedent `ef-daily-report/memory/daily_report.md`) |

## Convention Compliance (source: repo `CLAUDE.md`; no `.cursor/rules`, `AGENTS.md`, `docs/` in repo — checked 2026-10-06)

| Rule | Applied in this plan |
|---|---|
| Frontmatter `name` = bare slug = folder name | Phase 2 — `name: ef-logwork`, folder `ef-logwork/` |
| Description <1024 chars, what + when + triggers | Phase 2 — mirrors `ef-daily-report` "Triggers on: …" style |
| Detailed docs in `references/`, no per-skill README | Phase 2 — `references/format-rules.md`, `references/audit.md` |
| `.cjs` Node, kebab-case filenames | Phase 1 — `scripts/git-activity.cjs`, `scripts/git-activity.test.cjs` |
| Plain-assertion Node tests, no framework | Phase 1 — copies `skills/worktree/scripts/worktree.test.cjs` harness shape |
| Cross-refs use `/rk:<slug>` | Phase 2 — refs to `/rk:ef-daily-report` |
| Version bump BOTH manifests, same commit, minor for new skill | Phase 4 — `4.2.2 → 4.3.0` |
| New skill in `EXACT_CATEGORY_MAP` | Phase 4 — `"ef-logwork": "utilities"` beside `ef-daily-report` |
| Don't reformat existing skill markdown | Phase 3 — `ef-daily-report/references/derivation.md` linked, not edited |

### Deliberate deviations

| Rule | What this plan does instead | Why |
|---|---|---|
| CLAUDE.md "Skill structure" says `name` with `rk:` prefix | Bare `ef-logwork` | Same CLAUDE.md "Skill naming convention" section (newer, 4.0.0) supersedes it — `rk:` prefix → `/rk:rk:…` |
| Config in skill folder lives in plugin cache → reset on every plugin update | Accept, follow `ef-daily-report` precedent | Only `shared_card` mutates at runtime and D4's JQL re-detects it; personal defaults ship in repo |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Git activity collector script](./phase-01-git-activity-collector-script.md) | Completed |
| 2 | [Skill body references and config](./phase-02-skill-body-references-and-config.md) | Completed |
| 3 | [Audit mode](./phase-03-audit-mode.md) | Completed |
| 4 | [Version bump and skill index](./phase-04-version-bump-and-skill-index.md) | Completed |

## Implementation Notes / Deviations

**Phase 1** — Completed (git-activity.cjs + test). Deviations: `--since` without hard `--until` (rebase rewrites committer date), `--source`+first-parent mainline filter to prevent pre-fork develop commits, concurrent gh reviews (pool of 8), verdict precedence (APPROVED > CHANGES_REQUESTED > COMMENTED).

**Phase 2** — Completed (SKILL.md + 3 references). Deviations: JQL modified for `Platform&Capability` tokenization issue, ledger reads working correctly (5 entries 5h45m 2026-10-06), --yes only confirms zero-warning drafts, config key `card_projects` added. Deferred: real test log (no delete-worklog tool).

**Phase 3** — Completed (audit.md + SKILL.md section). Deviation: default range = last 10 working days before today (today shown as ⏳). Deferred: PC dashboard cross-check (needs access).

**Phase 4** — In Progress (manifests 4.3.0, skills_data.yaml regenerated, tests green). Note: scan_skills.py hardcodes `.claude/skills` path; run from scratch dir with symlink. Commit pending.

## Dependencies

- Atlassian MCP (`addWorklogToJiraIssue`, `searchJiraIssuesUsingJql`, `getJiraIssue`; `listJiraIssueWorklogs` via `executeRead`) — cloudId `everfit.atlassian.net`
- `gh` CLI authenticated (login `tuannguyen-everfit`); `git` on PATH
- No cross-plan deps (only other plan dir `260601-1539-watzup-daily-report` has no `plan.md`)
