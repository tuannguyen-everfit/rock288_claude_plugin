---
title: "trust-loop effort split — plan/review high, code medium"
description: "Run trust-loop main session at medium; planner + code-reviewer subagents at high via --effort flag; intent check moved into reviewer"
status: in-progress
priority: P2
effort: 1h
branch: main
tags: [trust-loop, plan, code-review, effort]
blockedBy: []
blocks: []
created: 2026-11-02
---

# trust-loop effort split

Source: `plans/reports/brainstorm-261102-0000-trust-loop-effort-split.md` (approved).

## Goal
Inside `/rk:trust-loop` only: coding (main session) at `medium`, plan writing + every review pass at `high`. Other skills (`/rk:cook`, `/rk:fix`, `/rk:pr`…) unchanged.

## Mechanism
- Claude Code 2.1.316: skill frontmatter `effort:` sets the model effort while the skill runs; Agent tool `effort` param sets a subagent's effort when a skill explicitly asks for it.
- `--effort=<level>` flag on `/rk:plan` and `/rk:code-review` → they pass `effort: "<level>"` on every `planner` / `code-reviewer` spawn. The flag sits in each invocation text, so all 5 review rounds carry it.
- Agent frontmatter NOT changed (decided: scope = trust-loop only).

## Phases
| # | Phase | Status |
|---|---|---|
| 1 | [Edit skills + bump](phase-01-edit-skills-and-bump.md) | completed |
| 2 | [Validate in a real loop](phase-02-validate-effort-in-transcript.md) | pending (needs commit + push + plugin update + restart) |

## Rule sources
- `CLAUDE.md` (repo root) — version bump rule, don't-reformat rule, bare-slug naming
- No `docs/code-standards*`, `.cursor/rules/`, `.github/instructions/`, `AGENTS.md` in repo

## Convention Compliance
| Rule | Source | How plan complies |
|---|---|---|
| Bump `version` in plugin.json + marketplace.json, same number, same commit | CLAUDE.md "Version bumps" | 4.13.2 → 4.14.0 (minor: new flag) in phase 1 |
| Don't reformat existing skill markdown | CLAUDE.md Conventions | Targeted line edits only; keep bullet/numbering style |
| Skill `name` = bare slug | CLAUDE.md naming | No `name` change |
| Detail in `references/`, SKILL.md stays routing | CLAUDE.md Skill structure | Flag doc is 2–4 lines in SKILL.md; no new reference file needed (YAGNI) |
| Skill `metadata.version` bumped on content change | repo precedent (every skill edit in git log bumps it) | trust-loop 1.10.1→1.11.0, plan 1.3.0→1.4.0, code-review 2.0.3→2.1.0 |

## Deliberate deviations
- Plan written directly instead of via `planner` subagent: 5 targeted edits, full context already in session.

## Risks
1. Skill-frontmatter `effort: medium` may not hold across a long turn with nested skills → phase 2 checks; fallback = drop field, human runs `/effort medium`.
2. Medium coding may raise review rounds → track `Review: <n> rounds` in reports.
3. Installed plugin is 4.10.1 → `plugin update` before phase 2.

## Phase 1 result (2026-11-02)
Done; 7 files (spec said 6). Code review: 0 Critical, 4 Important, all fixed:
- `/rk:code-review` with a spec + `--effort` skips the inline Stage 1. The Stage 2 subagent checks the spec instead, so the intent check really runs at high.
- trust-loop step 5 also passes the step 3 red/green outputs to the reviewer, and the reviewer must not stash.
- trust-loop documents that skill `effort` lasts one turn: use `AskUserQuestion`, or the human runs `/effort medium` after a plain-text reply.
- `/rk:plan --effort` also covers the red-team `code-reviewer` spawns. That added the 7th file, `plan/references/red-team-workflow.md`.
Phase 2 must include a plain-text human reply mid-loop to test the turn scope.
