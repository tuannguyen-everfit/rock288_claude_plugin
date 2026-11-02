# Brainstorm: trust-loop — env gate + review-until-clean loop

Date: 2026-10-30 · Target: `plugins/rock288/skills/trust-loop/SKILL.md` (v1.9.1)

## Problem
1. Loop (esp. `--recommend`) can invent new env vars (name/value) without the human.
2. Step 5 reviews once; no rule to re-review after fixes. `code-review` itself re-reviews fix-diff-only and caps at 3 cycles.
3. Review fixes may silently change the SPEC.

## Requirements (from user)
- New env → must ask the human; asked during design, before `/rk:plan`.
- Review findings Medium+ (= Critical/Important, `[Must fix]`) → fix → re-review the WHOLE diff → repeat until only Nice-to-have (`[Optional]`) left.
- Never change SPEC (original request + card AC + approved plan).

## Decisions
| Question | Pick |
|---|---|
| When to ask env | Step 2, after brainstorm, before `/rk:plan` (before step 3 when step 2 skipped). Not auto-decided by `--recommend` |
| Round cap | Max 5 full-review rounds; also BLOCKED if a fixed finding comes back |
| Must-fix that needs a SPEC change | Don't fix; stop and ask (also with `--recommend`) |

Rejected: unlimited rounds (LLM reviewer oscillation → infinite token burn); 3 rounds (BLOCKED too early on multi-file); continue-and-note spec conflicts (Critical bug could ship as a PR note).

## Agreed changes
1. **Hard rules** +2:
   - New env var (`default.env` key, config schema, deploy secret) = human's answer; never invented, even with `--recommend`.
   - Review fixes never change the SPEC (request, card AC, approved plan).
2. **Step 2 — Env gate**: after brainstorm, before `/rk:plan` (or before step 3 if step 2 skipped): list each new env (name, purpose, default, dev/prod value, secret?) → one question to the human; answers go into the plan. None → `no new env`. Fallback: env not on the approved list surfaces in implement → stop and ask.
3. **Step 5 — review loop**, round n ≤ 5:
   1. `/rk:code-review --pending` on the whole diff vs base (no fix-diff-only) + intent check
   2. Critical/Important = must fix; Nice-to-have = optional (not fixed; listed in PR/report)
   3. No must-fix → step 6
   4. Must-fix needing a SPEC change → don't fix; stop with finding + SPEC line + consequence of keeping it
   5. Fix the rest in the change's files → step 4 (new receipt) → next round
   - BLOCKED: round 5 still has must-fix, or a fixed finding reappears
4. **Report**: `Review: <n> rounds · fixed <k> · optional left <m>`.
5. **Version**: skill `1.9.1` → `1.10.0`; plugin minor bump in BOTH manifests (check: manifests already dirty with `ef-challenger-delete-profile`).

Unchanged: `/rk:cook --auto` internal review; `code-review` skill (trust-loop instructs full-diff review per round).

## Risks
- More rounds = more tokens/time per loop; cap 5 bounds it.
- Env gate adds one human stop on env-touching changes (by design).
- Severity labels depend on reviewer judgment; "fixed finding reappears" guard catches oscillation.

## Validation
- Read-through: every `--recommend` statement still consistent with the new human-only stops (env, SPEC conflict).
- Dry run on a small change: loop exits after a clean round; report shows the Review line.

## Next steps
- Edit `trust-loop/SKILL.md` + bump both manifests (one commit). No plan.md (single-file change, user's choice).

## Open questions
- None.
