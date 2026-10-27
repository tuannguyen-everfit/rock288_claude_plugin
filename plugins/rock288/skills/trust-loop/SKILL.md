---
name: trust-loop
description: "Verified delivery loop for a code change in any repo: intake, pre-flight baseline, design (brainstorm/plan when needed), implement with red-on-old / green-on-new tests, programmatic verification that writes a receipt bound to the exact working tree, adversarial + intent review, a commit only on a passing receipt, then the hand-off (PR, review request, Jira). Use for features, bug fixes and refactors when the output must be proven, not just reviewed. Triggers on: 'trust loop', 'verified change', 'implement and verify', 'làm có kiểm chứng'."
argument-hint: "<task | bug report | Jira card> [--init]"
metadata:
  author: rock288
  version: "1.0.0"
---

# Trust Loop

The human is the **architect**: sets intent, approves constraints, reads intent summaries, approves PRs. The agent locates, builds, verifies and reviews inside the repo's gates. Trust comes from verification evidence, not from a review score.

**`$SKILL_DIR`** = the "Base directory for this skill" path printed when this skill loads.

**Defer first:** if the repo has its own `.claude/skills/trust-loop/` (e.g. core-foundry), stop and run that one: `/trust-loop <task>`. Its tooling is stricter than this generic loop.

## Hard rules
- No commit without `verify-change --status` → `ok: true` for the current content. Any edit after verifying invalidates the receipt.
- Never weaken a test, a lint rule or a tier in `.claude/trust.json` to get green. A gate you believe is wrong is a question for the human.
- Never `--no-verify`, never push to a protected branch, never commit or push without the human's go-ahead (repo rules win when stricter).
- `/rk:cook` runs in its default gated mode here, **never `--auto`**: the loop's gates replace self-graded approval, they do not add to it.

## 0. Intake
- Restate the task in one sentence. Unclear intent → ask now (one round, specific questions); do not discover it in review.
- Jira card → `/rk:ef-branch-name <card>` for the branch. Otherwise branch off the base yourself; never work on a protected branch.
- No `.claude/trust.json` (or `--init`): draft it with `node $SKILL_DIR/scripts/init-config.cjs --print`, cross-check it against the repo's `CLAUDE.md` / CI gates, show it to the human, then write it (drop `--print`). Format: `references/trust-config.md`.

## 1. Pre-flight
- Locate the change: the call chain as `file:line`, where its unit test lives, async boundaries, and **the runtime check that will prove the change** (an e2e test, a smoke script, a real call). `/rk:scout` for wide searches.
- **Baseline** on the clean base before any edit: `node $SKILL_DIR/scripts/verify-change.cjs --baseline`. A tier already failing would block the receipt later: write it down and decide with the human — fix it first in its own commit, or keep this change away from it.
- Cross-boundary change (two services, API + client, schema + reader)? Write the contract and the order both sides change in.

## 2. Design and plan
- Intent clear and single-file with an obvious cause → skip to step 3.
- Several viable designs or vague requirements → `/rk:brainstorm`; its decision feeds the plan.
- Multi-file feature → `/rk:plan`. The plan must name the files, **the test that proves each behavior**, and the runtime check from step 1.
- Bug → reproduce first: a failing unit test or a runtime call before the fix (`/rk:debug` for hard ones).
- One concern per loop. A plan that does two things becomes two loops.

## 3. Implement
- Small change: main session. Plan with phases: `/rk:cook <plan>` (gated mode).
- Follow the repo's `CLAUDE.md` and rule files; new code goes where the feature already lives.
- Tests ship with the change and each must **fail on the old code and pass on the new**. Prove it once and keep both outputs:
  ```bash
  git stash push -m "trust-loop red <ticket>" -- <source files only>   # keep the new tests in place
  <run the new tests>   # must FAIL
  git stash list --format='%H %gs'                                     # find the entry by its tag
  git stash apply <sha> && git stash drop <its stash@{n}>
  <run the new tests>   # must PASS
  ```

## 4. Verify and self-correct
- `node $SKILL_DIR/scripts/verify-change.cjs` runs every tier in `.claude/trust.json` and writes a receipt for the exact working tree (logs under the git dir; the path is printed).
- A tier fails → fix it in the change's own files and run again, **max 3 iterations**. Still red → `BLOCKED`: stop, report the failing output, change approach or ask the human. Do not push through.
- A tier that rewrites files (formatter) leaves no receipt: review its edit, then verify again.
- Runtime evidence the tiers do not cover (e2e, a smoke against a local server, a real API call): run it yourself and keep the output for the PR. Say plainly what could not be exercised and why.
- Write reports and notes **before** the final verify: a new untracked file changes the fingerprint.

## 5. Review
- `/rk:code-review --pending`: adversarial pass + the repo's written conventions.
- Then the intent check, against the original request (not the plan):
  - Does the diff do exactly what was asked — nothing missing, nothing extra?
  - Is every behavior proven by a test that was red on the old code?
  - Two concerns in one diff → split into two loops.
- Any edit from review → back to step 4 (the receipt is now stale).
- The same correction a second time → propose turning it into a mechanical check (a lint rule, a test, a tier) as a separate change.

## 6. Commit
- `node $SKILL_DIR/scripts/verify-change.cjs --status` → `ok: true`.
- Show the human the staged diff and the commit message; commit only on their go-ahead. Message format = the repo's rule (e.g. `type(scope): CARD summary`). Body: intent summary + how it was verified (tiers + runtime evidence).

## 7. Hand-off
Each step publishes outside the repo: confirm once with the human before the first one.
1. **PR**: `/rk:ef-ship` (push + PR), then `/rk:ef-pr-description`. The body carries a verification table — per test: old code red / new code green — the receipt tiers, runtime evidence, and what is not in this PR.
2. **Review request**: the channel and reviewers the human names; the evidence goes in the PR or the thread, not only in chat.
3. **Jira** (only when the loop implements a card): `/rk:ef-logwork`, then move the card per the team's workflow. Do not close it while acceptance criteria outside this PR are open.
4. **Report**:
   ```
   Change: <one line> · Branch: <...> · Commit: <sha>
   Intent: <what was asked, what the diff does>
   Verified: <tiers from the receipt> · Red/green: <tests> · Runtime: <what was exercised>
   Not verified: <anything skipped and why>
   Open questions: <...>
   ```

## Credits
Adapted from the `trust-loop` workflow in core-foundry (Huy Nguyen): receipts bound to a working-tree fingerprint, red-on-old / green-on-new proof, intent review. This version is a generic rewrite driven by `.claude/trust.json`.
