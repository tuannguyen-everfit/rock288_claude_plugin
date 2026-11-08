# Brainstorm — make /rk:plan + /rk:cook output pass /rk:code-review with fewer findings

Date: 2026-11-08 · Status: approved → /rk:plan

## Problem
Code from plan → cook still collects many review findings. Goal: move prevention upstream so `/rk:code-review` (and trust-loop review rounds) find less.

## What /rk:code-review demands (vs current plan/cook coverage)

| Review stage | Checks | Plan/cook today |
|---|---|---|
| 0 Grounding | read rule files | ✅ both (`find-repo-rules.cjs`) |
| 0 Dangling refs | grep every new name | ❌ |
| 0 Reach past diff | grep callers of changed behavior | ⚠️ cook 1 line; plan none; trust-loop only |
| 1 Spec compliance | missing reqs / extras | ⚠️ vague "acceptance criteria" |
| 2 Conventions | placement, validator, envelope, auth, docs | ✅ heavy |
| 2 Expected load | races, N+1, unbounded | ⚠️ "consider" bullets |
| 3 Adversarial | null/empty, config, partial write, swallowed errors | ⚠️ "consider" bullets, no artifact |

## Evidence — 72 findings, 24 real review reports (rock288 + ~/Source/*)

| Category | % | Preventable at |
|---|---|---|
| Wrong assumption about existing code ("mirrors X" but X's condition differs) | 13.9 | plan |
| null/empty/missing config default | 12.5 | mostly cook |
| External-contract mismatch (other service validator, LLM schema, Jira API) | 11.1 | plan |
| Partial write / data integrity | 9.7 | plan |
| Caller/consumer not updated | 8.3 | plan |
| Spec gap 6.9 · lib semantics 6.9 · error handling 5.6 · test gap 5.6 | | mixed |
| Convention | 4.2 | (already covered heavily) |

Caveat: trainerize-migration-tool = 54% of findings (external-API-heavy) → skews contract/assumption categories.

Key insight: conventions get most investment, cause 4%. Not reading code/contracts outside the diff = 33%, mostly knowable at plan time. "Consider X" bullets produce no artifact → cook has nothing to follow.

## Approaches evaluated
1. **Plan heavy + cook light** ✅ chosen — plan writes evidence-backed Reach & Contracts section; cook self-checks against it. Covers ~45% of findings. Cost: plan +30–60 lines.
2. Cook self-check only — cheaper (~2 files), but plan-time mistakes found after code written → rewrite.
3. Extra mini-review subagent in cook — most catches, ~2× review tokens, duplicates trust-loop rounds, doesn't fix root cause.

## Decisions
- D1 Focus: plan heavy + cook light.
- D2 Reach list single source: definition moves to `plan/references/reach-and-contracts.md`; trust-loop step 1 points to it, keeps its cross-repo part.
- D3 Align cook review severity with code-review (Critical/Important/Nice-to-have; auto-approve only at 0 Critical + 0 Important; drop score).

## Final design

**Plan**
1. NEW `plan/references/reach-and-contracts.md` (~80 lines), 5 blocks, each row needs `file:line` or probe evidence; `n/a — <reason>` valid, omission not:
   - Mirrored rules (always): quote real condition + file:line
   - Reach list (always): every caller/producer/consumer/entry point → changes / unchanged because…
   - Verified contracts (if external): source path or probe result
   - Failure table (if multi-step write): fail at step N → persisted state → re-run recovery
   - Config defaults (if env/config read): actual default value
   - ❌/✅ examples from real findings
2. `plan/SKILL.md`: new step after Codebase Understanding, never skipped (incl `--fast`); flowchart node; pass to planner prompt.
3. `plan/references/output-standards.md`: section template; each failure-table row + critical branch → named negative test.
4. `plan/references/solution-design.md`: "consider race/partial failure" bullets → point to the blocks.

**Cook**
5. NEW `cook/references/pre-review-self-check.md` (~50 lines), after Test, before Step 5: grep new names; reach list rows done/proven; external input null/empty/wrong-type path; write order vs failure table; no swallowed catch; AC → file:line + extras listed. Output `✓ Self-check: …`. No plan (`--fast`) → build mini reach list. Paste into code-writing subagent prompts.
6. `cook/SKILL.md` + `references/workflow-steps.md`: add step to flow.
7. `cook/references/review-cycle.md` + Step 5: Critical/Important/Nice-to-have; auto approve at 0 Critical + 0 Important; reviewer prompt cites code-review finding gate; drop score.

**Trust-loop**
8. `trust-loop/SKILL.md` L43 reach-list definition → pointer to plan reference; keep L44 cross-repo. Check `references/review-round.md` §Reach list stays consistent.

**Version**: minor `4.19.1 → 4.20.0` in plugin.json + marketplace.json (same commit).

## Out of scope (YAGNI)
No new conventions; no extra reviewer spawn; no change to `code-review` itself.

## Risks
- Plan length +30–60 lines.
- Planner fills blocks perfunctorily → mitigate: every row needs file:line/probe; cook self-check cross-checks.
- Trust-loop pointer change must not drop its cross-repo/BLOCKED behavior.

## Success metric
After ~10 new reviews, rerun same categorization. Target: categories wrong-assumption + contract + caller + partial-write from 43% → <20%.

## Next steps
`/rk:plan` with this report → phases: (1) plan-side, (2) cook-side, (3) trust-loop + version bump.

## Unresolved questions
- None blocking. Verify current plugin version before bump (expected 4.19.1).
