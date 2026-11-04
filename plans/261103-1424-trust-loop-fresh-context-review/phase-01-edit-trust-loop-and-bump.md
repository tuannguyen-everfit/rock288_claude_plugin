# Phase 1 — Edit trust-loop + new reference + bump

**Status:** completed · **Effort:** 1h

## Files
| File | Change |
|---|---|
| `plugins/rock288/skills/trust-loop/SKILL.md` | Rewrite `## 5. Review`; Effort line; `metadata.version` 1.12.1 → 1.13.0 |
| `plugins/rock288/skills/trust-loop/references/review-round.md` | NEW: brief template, 2 prompt templates, output format, dispute rules |
| `plugins/rock288/.claude-plugin/plugin.json` | `version` 4.15.1 → 4.16.0 |
| `.claude-plugin/marketplace.json` | `plugins[0].version` 4.15.1 → 4.16.0 |

## 1. SKILL.md — Effort line
Replace `/rk:code-review --effort=high` (every reviewer, including the intent check) with: review rounds spawn `rk:code-reviewer` subagents with `effort: "high"` (step 5). Keep `/rk:plan --effort=high`.

## 2. SKILL.md — new `## 5. Review` (target shape, keep the existing terse style)
```
## 5. Review
Each round runs in fresh subagents that never see this session: what they get is the frozen brief and the diff, nothing else. Review → fix → verify → review again, until a round finds only Nice-to-have. **Max 5 rounds.** Format of the brief, the prompts and the findings: `references/review-round.md`.

Before round 1 (after the step 4 receipt passes): write the brief to `$(git rev-parse --git-path rk-trust/review-brief.md)` — the original request verbatim, the card's AC and SPEC / SD links, the step 1 reach list, the step 3 red / green outputs, the base ref. Overwrite any earlier brief and delete `rk-trust/review-rounds.md`. The brief does not change after this, except `## Disputed`.

Each round:
1. In one message, spawn two new `rk:code-reviewer` agents with `effort: "high"`: **quality** and **adversarial**, prompts from `references/review-round.md` with only the placeholders filled. Do not add a line about this round, earlier rounds or what was fixed. Both review the whole diff against the base, every round.
2. Merge the findings by `file:line`. Append the round to `rk-trust/review-rounds.md` (only this session reads it).
3. No `[Must fix]` → step 6. `[Optional]` goes to the PR description and the report; the loop does not fix it.
4. A `[Must fix]` marked `spec-conflict: yes` → do not fix it. Stop and show the human the finding, the SPEC line it conflicts with, and what happens if it stays. Also with `--recommend`.
5. Every other `[Must fix]` is fixed in the change's own files. Believe one is wrong? Do not drop it: append it to the brief's `## Disputed` with the evidence (`file:line`, test output). Then → step 4 (the receipt is now stale) → next round.

`BLOCKED` (stop, report the open findings): a `[Must fix]` still left after round 5; a finding the round log shows fixed comes back; a reviewer upholds a disputed finding.

The same correction a second time → propose turning it into a mechanical check (a lint rule, a test, a tier) as a separate change.
```
- The intent check (5 questions) moves to `references/review-round.md` (quality prompt). SKILL.md keeps one line pointing to it, so the questions are not duplicated.
- The `--recommend` paragraph stop list ("a review finding that would change the SPEC (step 5)") stays valid. Add "a disputed finding upheld" only if it reads naturally; otherwise BLOCKED already covers it.

## 3. references/review-round.md (NEW) — sections
1. **Why**: the main session coded and fixed, so it is anchored. Reviewers get a fixed brief + the diff, never the session's story. This file is the only source of the prompts; main fills placeholders and nothing else.
2. **Brief template** (`rk-trust/review-brief.md`):
   ```
   # Review brief — <ticket or one-line task>
   Base: <ref>   Repo: <abs path>
   ## Request (verbatim)
   ## Acceptance criteria / SPEC / SD links
   ## Reach list (step 1)
   ## Red / green (step 3)   <command + trimmed outputs, old red, new green>
   ## Disputed               <empty at round 1>
   ```
3. **Quality prompt** (`{BRIEF}`, `{BASE}`, `{CODE_REVIEW_DIR}`):
   - Read `{BRIEF}`. Diff = `git diff {BASE}` plus untracked files (`git status --porcelain`). Review the whole diff.
   - Stage 0 from `{CODE_REVIEW_DIR}/SKILL.md`: read CLAUDE.md / AGENTS.md / `.cursor/rules` + ancestors of the changed paths, resolve every new name (`references/checklists/base.md` Dangling References), grep every caller of a changed function.
   - Quality + convention per `{CODE_REVIEW_DIR}/SKILL.md` Stage 2 (+ `checklists/api.md` when the API is touched), expected load.
   - Intent check against the Request (not a plan), each "no" = `[Must fix]`: does exactly what was asked; every behavior proven by a test red on old code (use the brief's red/green, do not stash or re-run old code); every reach-list entry updated or proven unaffected; moved/merged code keeps validation + error handling; one concern only.
4. **Adversarial prompt** (`{BRIEF}`, `{BASE}`, `{CODE_REVIEW_DIR}`): the attack vectors + rules from `{CODE_REVIEW_DIR}/references/adversarial-review.md` §1. Read the brief for context. Self-adjudicate: keep a finding only with a concrete trigger and impact. Critical/Medium → `[Must fix]`, Low → `[Optional]`.
5. **Shared rules, both prompts**: finding gate (a concrete input → a wrong result; a convention finding cites the written rule or sibling); review only, no edits, no stash, no commands that write; you are a fresh reviewer — nothing outside the brief and the repo is known to you.
6. **Disputed**: for each entry in your lane, rule `UPHELD` (still a must-fix, with why) or `WITHDRAWN` (the evidence holds). Judge from the code and the evidence. The implementer's argument has no weight on its own.
7. **Output format** (final message, nothing else):
   ```
   [Must fix|Optional] [Q|A] path:line — defect — failure scenario — spec-conflict: yes|no
   DISPUTE <path:line> UPHELD|WITHDRAWN — reason
   VERDICT: must-fix|clean
   ```
   `spec-conflict: yes` only when the fix would change the asked-for behavior, AC, API contract or response shape.
8. **Round log** (`rk-trust/review-rounds.md`, main only): `## Round n` + the merged lines + `fixed|disputed` per must-fix.

## 4. Bump
plugin.json + marketplace.json → `4.16.0`; trust-loop `metadata.version` → `1.13.0`.

## Done when
- [x] Step 5 does not call `/rk:code-review` and has no free-text prompt from main
- [x] Brief + round log paths sit under `--git-path rk-trust/`
- [x] Dispute → UPHELD → BLOCKED path written; main has no "reject" path
- [x] Intent check exists once (review-round.md); SKILL.md points to it
- [x] Both manifests at 4.16.0; trust-loop 1.13.0
- [x] `node plugins/rock288/skills/trust-loop/scripts/verify-change.test.cjs` still passes (no script change, sanity)

## Outcome (2026-11-03)
3 fresh-reviewer rounds on the change itself; all must-fix applied. Added beyond the plan:
- Prompts: isolation rule (ignore hook-injected Plan/Task context + agent memory, no memory/task writes, no tests/builds, no other git-dir files); `{REPO}` placeholder, `git -C`, `status -uall`; `{BASE}` = merge-base SHA
- Brief: `## Settled` (withdrawn disputes + human "keep it" answers), `Branch:` line, `## Red / green` grows with fix tests
- Entries (new / resume / follow-up) logged in the round log; base recomputed per entry; 5-round cap per entry
- Dispute rules: both lanes rule every entry; UPHELD by any → BLOCKED; unruled → open
- Brief + log written with Bash (`.git/` Write/Edit may prompt in bypass mode — unverified, phase 2 check)
- `code-review/SKILL.md:29`: dropped stale "passed by /rk:trust-loop"; code-review 2.1.0 → 2.1.1
- `.claude/agent-memory/` added to step 0 info/exclude list; report line gains `disputes settled <d>`
