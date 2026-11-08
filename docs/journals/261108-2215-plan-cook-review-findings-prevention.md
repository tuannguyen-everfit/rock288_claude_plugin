# 2026-11-08 — plan + cook: stop shipping findings we could have seen coming

**Context:** [Brainstorm 261108-2125](../../plans/reports/brainstorm-261108-2125-plan-cook-review-findings-prevention.md) · [Plan](../../plans/261108-2125-plan-cook-review-findings-prevention/plan.md)

**Status:** uncommitted in working tree. Target rk `4.19.1 → 4.20.0` (plan 1.5.0, cook 2.3.0, trust-loop 1.15.2). Bump both manifests in the same commit as content.

## What Went Right

- Brainstorm was grounded in data: 72 Critical/Important findings across 24 real reviews. About 43% were knowable before a line of code (wrong assumption about existing code 14%, external contract 11%, partial write 10%, caller not updated 8%).
- Review of the change itself: 0 Critical / 3 Important / 4 Nice-to-have. All fixed.

## What Hurt

- **The review gate was invented.** Cook's prompt asked reviewers for a score and gated auto-approve at `score ≥ 9.5`. `agents/code-reviewer.md` never had a score. A 9.5 let Important findings through. We were gating on a number nobody defined.
- **The plan skill itself missed a reach-list row.** `plan/references/workflow-modes.md` `--fast` steps had no Reach & Contracts step. We wrote a feature that forces reach lists and then forgot to apply it to our own fast path.
- **Direction error in trust-loop.** Step 1 said "step 2's plan reuses this list", but step 2 runs after step 1. Reversed sentence, caught only in review.
- **Severity vocabulary mismatch.** `agents/code-reviewer.md` emits High/Medium/Low. Without a mapping, a High would silently fall outside the Critical/Important gate and auto-approve under `--auto`. Added the mapping line to `cook/references/review-cycle.md`.
- **Path trap.** A cross-skill path inside `references/` must be `$SKILL_DIR/../plan/...`. A bare `../plan/...` resolves against the wrong base.

## Technical Details

```
Reviewer output:   High | Medium | Low      (agents/code-reviewer.md)
Cook gate:         0 Critical + 0 Important  (score ≥ 9.5 removed)
Mapping:           High → Important, Medium/Low → Nice-to-have
Cross-skill ref:   $SKILL_DIR/../plan/references/reach-and-contracts.md
```

Done-when greps pass; `verify-change.test.cjs` passes. No runtime code changed, markdown only.

## Decisions

- **Plan heavy, cook light (D1).** Four of the top five categories are knowable at plan time. Cook only runs mechanical checks (dangling names, null/empty, swallowed errors, missing negative tests) in `pre-review-self-check.md`.
- **One source for the reach list (D2).** Defined in `plan/references/reach-and-contracts.md`. Trust-loop points at it.
- **Judge review by buckets, drop the score (D3).** Rejected keeping a score with a higher threshold. The threshold was never the problem; the number was invented.
- **Left `agents/code-reviewer.md` alone (D5).** It's shared across many skills. Mapping lives in cook instead.
- **Left `fix/` on its own score cycle (D6).** Out of scope. This is now a known inconsistency.

## Lessons

1. If a gate uses a number, find where the number is defined. If nowhere, it isn't a gate.
2. When a feature says "every X must do Y", run the feature's own rule over the plan that adds it. We failed that once already.
3. Read sentences about ordering against the actual step numbers.
4. Check every reviewer's severity vocabulary against your gate before trusting the mapping.

## Success Metric

After ~10 new reviews, re-categorize with the same 15 categories. Target: the four preventable categories fall below 20% of Critical/Important (now 43%). If we miss it, the plan reference is too thin, not the cook checks.

## Next Steps

1. Commit with the version bump in both manifests, then `claude plugin marketplace update rk-kit && claude plugin update rk@rk-kit`. Restart Claude Code.
2. Owner: tuannguyen. Re-categorize findings after ~10 reviews (target: next two weeks).
3. Follow-up: align `fix/` score cycle (D6). Open question: do we keep `fix/` score-based at all, or move it to the same bucket gate?
4. Open question: does the 9-check self-check add noticeable cook runtime? Measure on the next three runs.
