---
title: "plan + cook prevent review findings — Reach & Contracts, pre-review self-check, severity alignment"
description: "Plan writes evidence-backed Reach & Contracts (mirrored rules, reach list, verified contracts, failure table, config defaults); cook self-checks against it before review and judges review by Critical/Important, not score"
status: completed
priority: P2
effort: 2h
branch: main
tags: [plan, cook, code-review, trust-loop, review-findings]
blockedBy: []
blocks: []
created: 2026-11-08
---

# plan + cook prevent review findings

Source: `plans/reports/brainstorm-261108-2125-plan-cook-review-findings-prevention.md` (approved design + evidence: 72 findings / 24 reviews).

Goal: findings that are knowable before code (wrong assumption about existing code 14%, external contract 11%, partial write 10%, caller not updated 8%) get resolved in the plan; mechanical ones (dangling name, null/empty, swallowed error, missing negative test) get caught by cook before review.

## Phases

| # | Phase | Files | Status |
|---|---|---|---|
| 1 | [Plan side](phase-01-plan-reach-and-contracts.md) | NEW `plan/references/reach-and-contracts.md`; `plan/SKILL.md`; `plan/references/output-standards.md`; `plan/references/solution-design.md` | completed |
| 2 | [Cook side](phase-02-cook-self-check-and-severity.md) | NEW `cook/references/pre-review-self-check.md`; `cook/SKILL.md`; `cook/README.md`; `cook/references/{workflow-steps,review-cycle,subagent-patterns,intent-detection}.md` | completed |
| 3 | [Trust-loop, bootstrap, versions](phase-03-trust-loop-and-version.md) | `trust-loop/SKILL.md`; `bootstrap/references/workflow-{auto,fast}.md`; both manifests | completed |

All paths under `plugins/rock288/skills/` unless noted. Markdown only — no scripts change.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Plan heavy, cook light | 4 of top-5 categories knowable at plan time |
| D2 | Reach list defined once in `plan/references/reach-and-contracts.md`; trust-loop step 1 points to it, keeps its own cross-repo bullet | one source; trust-loop already passes its reach list to review rounds |
| D3 | Cook judges review by Critical / Important / Nice-to-have (code-review buckets + finding gate); auto-approve = 0 Critical + 0 Important; score dropped | score ≥ 9.5 let Important findings through; `agents/code-reviewer.md` has no score at all — cook's prompt invented it |
| D4 | Planner subagent not spawned for this plan | design fully settled in brainstorm; context already loaded |
| D5 | `agents/code-reviewer.md` unchanged | shared by many skills; cook's Step 5 prompt names the buckets explicitly |
| D6 | `fix/` keeps its own score-based cycle | separate skill, not in scope (user asked plan + cook); noted for follow-up |

## Reach & Contracts

### Mirrored rules
| New behavior | Mirrors | Actual (quoted) | Source |
|---|---|---|---|
| Plan reach list | trust-loop reach list | "every caller of a function whose signature, return value or behavior will change (grep, including files you would not otherwise touch), plus the tests, fixtures, config and exports that must follow. That list is the scope; anything outside it is extra." | `trust-loop/SKILL.md:43` |
| Cook severity buckets | code-review finding gate | "A bug, risk or scale finding names a concrete input or situation and the wrong result it leads to. No concrete case → drop it" | `code-review/SKILL.md` Finding gate |
| Self-check output line | cook pre-flight line | `✓ Pre-flight: [N] rule files read ([names]) - [M] conventions resolved - …` | `cook/SKILL.md` Convention Pre-flight |

### Reach list
| Site | Kind | Changes? | What |
|---|---|---|---|
| `cook/SKILL.md:106,128` | score≥9.5 in mode table + gate | yes | → 0 Critical + 0 Important |
| `cook/README.md:50` | score≥9.5 | yes | same |
| `cook/references/intent-detection.md:57` | score≥9.5 | yes | same |
| `cook/references/workflow-steps.md:109,117` | reviewer prompt + auto rule | yes | buckets |
| `cook/references/review-cycle.md` | whole cycle | yes | rewrite to buckets |
| `cook/references/subagent-patterns.md:52` | reviewer prompt "Return score" | yes | buckets |
| `bootstrap/references/workflow-auto.md:51`, `workflow-fast.md:47` | describes cook --auto | yes | describe new rule |
| `trust-loop/SKILL.md:43` | reach list definition | yes | pointer + keep cross-repo L44 |
| `trust-loop/SKILL.md:58` | "stops only on critical review issues" | yes | "Critical or Important" |
| `trust-loop/references/review-round.md:35,82,100` | consumes reach list | no — format `file:line per caller…` still matches block 2 | |
| `fix/references/review-cycle.md`, `fix/SKILL.md:75` | own score cycle | no — D6 | |
| `agents/code-reviewer.md` | severity Critical/High/Medium/Low | no — D5 | |
| `plan/references/output-standards.md:141`, `solution-design.md:38` | vague edge-case bullets | yes | point to blocks |
| `.claude-plugin/marketplace.json`, `plugins/rock288/.claude-plugin/plugin.json` | version 4.19.1 | yes | 4.20.0 |
| `scripts/skills_data.yaml` | skill index | no — descriptions unchanged | |

### Verified contracts
n/a — no external service; Claude Code reads skill markdown only.

### Failure table
n/a — no runtime writes; one commit.

### Config & defaults
n/a — no env/config read.

## Convention Compliance (source: repo `CLAUDE.md`)

| Rule | Applied |
|---|---|
| Version bump in BOTH manifests, same commit, minor for new behavior | Phase 3 → 4.20.0 |
| Detailed docs in `references/`, SKILL.md stays routing | new content in 2 new reference files; SKILL.md gets short pointers |
| Don't reformat existing skill markdown | edits are line-local; no re-wrap |
| No README inside skill folders | no new README (existing `cook/README.md` only gets its one line fixed) |
| Bare-slug cross refs `/rk:<slug>` | used in new files |

### Deliberate deviations
| Rule | Instead | Why |
|---|---|---|
| Plan via planner subagent | written in main session | D4 |

Skill `metadata.version` bumps: plan 1.4.0 → 1.5.0, cook 2.2.1 → 2.3.0, trust-loop 1.15.1 → 1.15.2 (pointer only).

## Implementation notes
Deviations recorded during review:
- `cook/references/pre-review-self-check.md` path written as `$SKILL_DIR/../plan/references/reach-and-contracts.md` (sibling convention in `convention-preflight.md`), not bare `../plan/...` from phase 2 verbatim block.
- trust-loop L43 last sentence: step 1 runs before step 2, so now reads "Step 2's `/rk:plan` reuses this list as its block 2 (pass it in the prompt) and adds what its greps find." Phase 3 wording pointed backwards.
- Reach-list rows missed by plan, added: `plan/references/workflow-modes.md` fast-mode steps (Reach & Contracts step added); `cook/README.md:67` workflow line (`[Self-check]`).
- `cook/references/review-cycle.md`: reviewer High/Medium/Low mapped to Important/Nice-to-have (`agents/code-reviewer.md` template differs; D5 kept).
- Self-check: `--no-test` makes check 8 n/a; output line unified to `✓ Step 4.5: Self-check 9/9 - [N] names resolved - [M] reach rows verified - [K] fixes`; `--fast` dropped from the "no section" example.
- Review: 0 Critical / 3 Important / 4 Nice-to-have, all fixed. Done-when greps pass; `verify-change.test.cjs` passes.

## Success
- After ~10 new reviews, rerun categorization (same 15 categories). Target: wrong-assumption + contract + caller + partial-write < 20% of Critical/Important (now 43%).

## Unresolved
- `fix/` score cycle — align in a follow-up?
