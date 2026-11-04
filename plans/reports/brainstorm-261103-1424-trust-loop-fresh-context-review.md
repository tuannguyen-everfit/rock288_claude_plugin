# Brainstorm — trust-loop: fresh-context review rounds

## Problem
trust-loop step 5: review → fix → review again. Re-review after a fix is only accurate after the human runs `/clear` and calls `/rk:code-review` again. Inside the loop, round 2+ is biased.

## Root cause (from reading trust-loop/SKILL.md step 5 + code-review/SKILL.md)
Reviewers are already subagents (empty context). The bias leaks through the parts that still run in the main session:
1. Main writes the reviewer prompt each round → round 2+ carries "fixed A, B, check again" → reviewer anchored on the fix.
2. Main adjudicates (code-review Stage 3 Accept/Reject) + sorts findings (5.2) → implementer grades own code, drops real findings as "false positive".
3. Stage 0 grounding runs inline in a bloated / compacted main context.
4. code-review says "re-reviews use fix-diff-only optimization", trust-loop says "whole diff every round" → conflict.

## Rejected approaches
- **`/compact` after each fix**: skill cannot invoke built-in CLI commands, no hook forces compaction → needs human = loses unattended. Also the summary keeps main's own conclusions ("fixed A because B", "C is false positive"), which is exactly the bias. Reduces tokens, not anchoring.
- **Headless `claude -p` per round**: closest to `/clear` but brings permission mode, auth, nested-process cost, poor observability.
- **Pause for human `/clear` + `--resume-review`**: the manual flow today, breaks unattended + `--recommend`.
- **1 reviewer subagent doing quality + adversarial**: ~50% cheaper but adversarial is anchored on its own quality pass.
- **Main keeps adjudication**: no change, largest bias source stays.

## Decisions
| # | Question | Pick |
|---|---|---|
| 1 | Where a round runs | Fresh subagents each round + frozen brief file |
| 2 | Reviewer structure | 2 parallel `rk:code-reviewer` (quality, adversarial), `effort: high` |
| 3 | Main's power over must-fix | Cannot drop: fix, or dispute via brief; reviewer upholds → BLOCKED |

## Final design
**Brief** — written once at end of step 4, before round 1: `$(git rev-parse --git-path trust-loop/review-brief.md)` (git dir → receipt fingerprint unaffected, never committed).
- Original request verbatim, card AC, SPEC/SD links
- Step 1 reach list, step 3 red/green outputs
- Intent check (existing 5 questions), base ref
- `## Disputed`: the only part appended later (finding + main's argument)

**Round** — spawn 2 new `rk:code-reviewer` agents in parallel, `effort: high`:
- Quality: Stage 0 (read CLAUDE.md/AGENTS.md/rules, resolve new names, grep callers) + quality/convention + intent check
- Adversarial: `code-review/references/adversarial-review.md`
- Prompt = fixed template in `trust-loop/references/review-round.md`; main fills placeholders only (brief path, base SHA), adds no free text
- Always whole diff vs base, never fix-diff-only
- Output line format: `[Must fix]|[Optional] file:line — defect — failure scenario — spec-conflict: yes|no`

**Main** —
- Merge by `file:line`
- Every `[Must fix]`: fix, or append to `## Disputed`. Next round's fresh reviewer re-judges; upheld → BLOCKED, ask human
- `spec-conflict: yes` → stop, ask human (existing rule)
- Round log at git-dir `trust-loop/review-rounds.md` (main only, reviewers never read) → detects a fixed finding coming back → BLOCKED

**Unchanged** — max 5 rounds, review → fix → step 4 verify → review, `[Optional]` to PR + report, `/rk:code-review` skill itself (manual use same as before).

## Files
- `plugins/rock288/skills/trust-loop/SKILL.md`: rewrite step 5, Effort line
- New `plugins/rock288/skills/trust-loop/references/review-round.md`: brief template, 2 prompts, output format
- Bump trust-loop `1.12.1 → 1.13.0`; plugin `4.15.1 → 4.16.0` in `plugin.json` + `marketplace.json`

## Risks
- ~2x tokens per round vs one reviewer
- `Disputed` text is main's voice; mitigated: reviewer told to judge independently, sees argument only, not fix history
- Subagents cannot spawn subagents → each reviewer runs its stage inline (fine, context is empty)

## Success criteria
- Round 2+ reviewer prompt byte-identical to round 1 except placeholders
- Main never removes a `[Must fix]` without a fresh reviewer upholding the dispute
- Brief/round files do not change the `verify-change --status` fingerprint

## Unresolved questions
- None blocking. Verify at impl: `rk:code-reviewer` agent accepts `effort` param + has Read/Grep/Bash for Stage 0 (it does per agent list).
