# Brainstorm: trust-loop effort split (plan/review high, code medium)

## Problem
Trust-loop runs everything at session effort. Want: plan + review at `high`, coding at `medium` — cheaper/faster implement, rigorous judgement.

## Findings (scout)
- Claude Code 2.1.316 supports `effort:` (`low|medium|high|max|int`) in agent frontmatter AND skill frontmatter; Agent tool takes `effort` param when a skill explicitly asks.
- Agent frontmatter effort overrides session effort (`a.effort ?? sessionEffort`).
- `/rk:plan` writes plan via `planner` subagent (model opus, no effort). `/rk:code-review` stage 2 + adversarial both spawn `code-reviewer` (no effort). `/rk:cook` codes in main session.
- `code-reviewer` used by 9 skills, `planner` by 13 → frontmatter change = global.
- Main session can't reliably switch effort mid-turn → effort must sit on subagents.

## Approaches evaluated
| Approach | Pro | Con |
|---|---|---|
| A. Agent high + loop `effort: medium` (chosen base) | ~3 lines, deterministic | triage/intent check medium unless moved |
| B. Loop high + coder subagent medium | exact semantics | coder loses context (reach list, red/green stash), rewrite step 3, fragile |
| C. Per-skill frontmatter (plan/review high, cook medium) | no agent change | nested-skill effort pop/push unverified, silent failure |

Scope decision: **trust-loop only** (not global agent frontmatter) — other skills keep session effort; avoids downgrading review when session runs xhigh/max.

## Final design
- `skills/trust-loop/SKILL.md`
  - frontmatter `effort: medium` → main session (intake, brainstorm, cook code, verify, triage) medium
  - step 2: `/rk:plan --effort=high`
  - step 5: `/rk:code-review --pending --effort=high`; original request + reach list + 5 intent-check questions go into reviewer prompt; main session only reads verdicts, sorts by reviewer labels
- `skills/plan/SKILL.md`: `--effort=<level>` → spawn `planner` with `effort: <level>`; absent = unchanged
- `skills/code-review/SKILL.md` + `references/adversarial-review.md`: `--effort=<level>` → every `code-reviewer` spawn (stage 2 + adversarial) gets `effort: <level>`
- Agents untouched → `/rk:cook`, `/rk:fix`, `/rk:pr` unaffected
- Bump 4.13.2 → **4.14.0** (minor, new flag) in plugin.json + marketplace.json

Why a flag, not prose "remember to pass effort": flag lives in each invocation text → every review round (up to 5) carries it; no reliance on LLM memory across rounds.

## Risks
1. Skill-frontmatter `effort: medium` persistence across long turn + nested skills unverified. Fallback: drop field, human runs `/effort medium` before loop.
2. Medium coding may raise review rounds (each = high review + verify) → net cost could rise.
3. Brainstorm stays medium (main session). Revisit only if design quality drops (YAGNI).
4. Installed plugin is 4.10.1 vs repo 4.13.2 → need `plugin update` after push.

## Validation
- Run trust-loop on a small task; grep session `.jsonl` `output_config.effort`: main = `medium`, planner/code-reviewer subagents = `high`.
- Compare report line `Review: <n> rounds · fixed <k>` over 5–10 loops before vs after.

## Next steps
1. `/rk:plan` from this report (or direct implement — small change, 5 files).
2. Implement, bump, push, `plugin update`, run validation loop.

## Unresolved questions
- Skill `effort` frontmatter: does it apply for whole turn when skill invoked by Slack bot headless session? Verify in validation run.
