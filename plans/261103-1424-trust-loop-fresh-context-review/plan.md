---
title: "trust-loop fresh-context review rounds"
description: "Step 5 review rounds run in fresh rk:code-reviewer subagents (quality + adversarial, parallel, effort high) from a frozen brief in the git dir; main cannot drop a must-fix"
status: in-progress
priority: P2
effort: 1.5h
branch: main
tags: [trust-loop, code-review, review, bias]
blockedBy: []
blocks: [261102-0005-trust-loop-effort-split]
created: 2026-11-03
---

# trust-loop fresh-context review rounds

Source: `plans/reports/brainstorm-261103-1424-trust-loop-fresh-context-review.md` (approved).

## Goal
Each review round in `/rk:trust-loop` step 5 must be as unbiased as a review after `/clear`, without stopping the unattended loop.

## Mechanism
- Frozen brief at `$(git rev-parse --git-path rk-trust/review-brief.md)`, written once before round 1. It sits next to the receipts in `rk-trust/`, outside the working tree, so the fingerprint is unaffected and it is never committed.
- Every round, main spawns 2 new `rk:code-reviewer` agents in one message, each with Agent `effort: "high"`: **quality** (Stage 0 + quality/convention + intent check) and **adversarial**.
- The prompt templates live in `trust-loop/references/review-round.md`. Main fills only `{BRIEF}`, `{BASE}`, `{CODE_REVIEW_DIR}`, `{LANE}`. It never adds free text such as "fixed X".
- Reviewers rule on their own findings using the finding gate. Main cannot drop a `[Must fix]`: it either fixes it or disputes it in the brief. A fresh reviewer that upholds the dispute → BLOCKED.
- Round log at `rk-trust/review-rounds.md` (main only) catches a fixed finding that comes back → BLOCKED.
- Main no longer calls `/rk:code-review` in step 5. Running it inline would put Stage 0 and adjudication back in the main session. The `code-review` skill is unchanged; reviewers read its reference files by path.

## Phases
| # | Phase | Status |
|---|---|---|
| 1 | [Edit trust-loop + new reference + bump](phase-01-edit-trust-loop-and-bump.md) | completed |
| 2 | [Validate in a real loop](phase-02-validate-in-real-loop.md) | pending (needs commit + push + plugin update + restart) |

## Rule sources
- `CLAUDE.md` (repo root): version bump rule, don't-reformat rule, detail in `references/`, bare-slug naming
- No `docs/code-standards*`, `.cursor/rules/`, `.github/instructions/` or `AGENTS.md` in the repo

## Convention Compliance
| Rule | Source | How plan complies |
|---|---|---|
| Bump `version` in plugin.json + marketplace.json, same number, same commit | CLAUDE.md "Version bumps" | 4.15.1 → 4.16.0 (minor: new behavior) |
| Detail in `references/`, SKILL.md stays routing | CLAUDE.md Skill structure | Templates + brief format in new `references/review-round.md`; step 5 in SKILL.md = flow only |
| Don't reformat existing skill markdown | CLAUDE.md Conventions | Only step 5 + Effort line + the `--recommend` stop list touched |
| Skill `metadata.version` bumped | repo precedent | trust-loop 1.12.1 → 1.13.0 |
| Session files out of the receipt / commit | trust-loop step 4 "write notes before final verify" + receipts in `rk-trust/` | Brief + round log live in git dir `rk-trust/` |

## Deliberate deviations
- The plan was written directly, not through a `planner` subagent: 4 files, and the full context is already in this session (same as the previous trust-loop plan).
- The adversarial reviewer always runs. code-review's scope gate (skip when ≤2 files and ≤30 lines) is dropped here: the user picked "2 parallel subagents", and a tiny diff costs a tiny adversarial pass.
- Adversarial adjudication moves from main into the reviewer, unlike `code-review/references/adversarial-review.md` §2. That move is the point of this change.

## Cross-plan
`261102-0005-trust-loop-effort-split` phase 2 (validate effort in a real loop) is still pending. Its review check (`/rk:code-review --effort=high` spawns at high) is replaced by this plan's direct spawns. Validate once, after this plan lands: this plan `blocks` it.

## Risks
1. `rk:code-reviewer` may ignore Agent `effort` → phase 2 checks the transcript.
2. ~2x tokens per round vs one reviewer.
3. A `Disputed` entry is written by main → the template tells the reviewer to judge from code + brief only and to give the argument no weight on its own.
4. A brief left over from an earlier loop in the same checkout → step 5 overwrites the brief and deletes the round log before round 1.
