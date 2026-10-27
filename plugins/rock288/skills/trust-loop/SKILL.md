---
name: trust-loop
description: "Verified delivery loop for a code change in any repo: intake, pre-flight baseline, design (brainstorm/plan when needed), implement with red-on-old / green-on-new tests, programmatic verification that writes a receipt bound to the exact working tree, adversarial + intent review, a commit only on a passing receipt, then the hand-off (PR, review request, Jira) and `/rk:pr-follow-up` until the PR runs on dev. Use for features, bug fixes and refactors when the output must be proven, not just reviewed. Triggers on: 'trust loop', 'verified change', 'implement and verify', 'làm có kiểm chứng'."
argument-hint: "<task | bug report | Jira card> [--init] [--recommend]"
metadata:
  author: rock288
  version: "1.6.0"
---

# Trust Loop

The human is the **architect**: sets intent, approves constraints, reads intent summaries, approves PRs. The agent locates, builds, verifies and reviews inside the repo's gates. Trust comes from verification evidence, not from a review score.

**`$SKILL_DIR`** = the "Base directory for this skill" path printed when this skill loads.

**`--recommend`**: design choices are taken by recommendation instead of asked. Pass it on to `/rk:brainstorm` and `/rk:plan` in step 2; they state each pick and log it. It does not skip the intake intent check or the human-decision points (a red required baseline tier, `BLOCKED`, hours for the worklog).

**Defer first:** if the repo has its own `.claude/skills/trust-loop/` (e.g. core-foundry), stop and run that one: `/trust-loop <task>`. Its tooling is stricter than this generic loop.

## Hard rules
- No commit without `verify-change --status` → `ok: true` for the current content. Any edit after verifying invalidates the receipt.
- Never weaken a test, a lint rule or a tier in `.claude/trust.json` to get green. A gate you believe is wrong is a question for the human.
- Never `--no-verify`, never push to a protected branch. Repo rules win when stricter: a repo whose rules say "commit / push only when the human says so" gets the diff and a wait at step 6, unless the task itself asked to commit or ship.
- The loop runs unattended: `/rk:cook` with `--auto`. The loop's own gates (receipt, red/green, review) hold the change, not approval clicks. Cook's finalize does not commit; the loop commits at step 6.

## 0. Intake
- Restate the task in one sentence. Unclear intent → ask now (one round, specific questions); do not discover it in review.
- Jira card → `/rk:ef-branch-name <card>` for the branch. Otherwise branch off the base yourself; never work on a protected branch.
- No `.claude/trust.json` (or `--init`): draft it with `node $SKILL_DIR/scripts/init-config.cjs --print`, cross-check it against the repo's `CLAUDE.md` / CI gates, show it to the human, then write it (drop `--print`). Format: `references/trust-config.md`.
- Session artifacts: `plans/` or `docs/journals/` not ignored by the repo → add them to `.git/info/exclude` once, so plans, reports and journals stay out of the commit (`git add -A`) and of the receipt.
- Settle the hand-off now so the loop runs to the PR without stopping: confirm once the Slack channel and reviewers (or "no Slack"), unless the task already says. Defaults = `/rk:ef-ship`'s: `#backend-review-code`, `@backend-team` + `Quang Pham Minh (BE)`. That answer is the go-ahead for step 7.

## 1. Pre-flight
- Locate the change: the call chain as `file:line`, where its unit test lives, async boundaries, and **the runtime check that will prove the change** (an e2e test, a smoke script, a real call). `/rk:scout` for wide searches.
- E2e tests only where the repo already has an e2e suite (an `e2e/` dir or `*-e2e` project, a `make e2e` / `nx e2e` target, an `e2e` tier). None → do not write or scaffold e2e: prove the change with unit tests plus a runtime call when one is possible, and put `no e2e suite in this repo` under "Not verified".
- **Baseline** on the clean base before any edit: `node $SKILL_DIR/scripts/verify-change.cjs --baseline`. A **required** tier already failing would block the receipt later: write it down and decide with the human — fix it first in its own commit, or keep this change away from it. An optional tier already failing (e.g. e2e checks red on the base) blocks nothing: write down which checks fail, so step 4 can show the change adds none, and go on.
- Cross-boundary change (two services, API + client, schema + reader)? Write the contract and the order both sides change in.

## 2. Design and plan
- Intent clear and single-file with an obvious cause → skip to step 3.
- Several viable designs or vague requirements → `/rk:brainstorm` (`--recommend` when this loop has it); its decision feeds the plan.
- Multi-file feature → `/rk:plan` (`--recommend` when this loop has it). The plan must name the files, **the test that proves each behavior**, and the runtime check from step 1.
- Bug → reproduce first: a failing unit test or a runtime call before the fix (`/rk:debug` for hard ones).
- One concern per loop. A plan that does two things becomes two loops.

## 3. Implement
- Small change: main session. Plan with phases: `/rk:cook <plan> --auto` (all phases in one go; it stops only on critical review issues left after 3 fixes).
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
Commit as soon as the receipt passes; the receipt is the gate, not a human. Check and commit in one command so nothing changes in between:
```bash
node $SKILL_DIR/scripts/verify-change.cjs --status && git add -A && git commit -m "<subject>" -m "<body>"
```
- Subject = the repo's rule (e.g. `type(scope): CARD summary`). Body: intent summary + how it was verified (tiers + runtime evidence). Pass the message inline: a message file inside the repo is untracked content and makes the receipt stale.
- A pre-commit hook fails → fix, back to step 4. Never `--no-verify`.
- Exception (hard rules): the repo forbids auto-commit and the task did not ask to commit → show the diff and the message, wait.

## 7. Hand-off
Runs right after the commit when the hand-off was settled at intake; otherwise confirm once with the human before the first step.
1. **PR**: `/rk:ef-ship --feature=<scope> --subtitle=<subtitle> --yes` with the commit's scope and subtitle: it pushes the commit, opens the PR against the base and chains `/rk:ef-pr-description`. Do not pass its `--slack` flags; step 2 posts the review request. The body carries a verification table — per test: old code red / new code green — the receipt tiers, runtime evidence, and what is not in this PR.
2. **Review request**: the channel and reviewers settled at intake; the evidence goes in the PR or the thread, not only in chat. Every Slack post (request, evidence, review round, merged, deployed) follows `references/slack-messages.md`: short verdict lines, no tables, no receipt hashes; the detail stays in the PR.
3. **Start the follow-up** (`/rk:pr-follow-up`), so review, merge and the dev deploy are not left to memory:
   ```bash
   node $SKILL_DIR/../pr-follow-up/scripts/deploy-signal.cjs pick     # pipelines from "deploy" in .claude/trust.json
   node $SKILL_DIR/../pr-follow-up/scripts/follow-up-state.cjs init --pr <PR url> --ticket <KEY> \
     --slack-channel <review channel id> --slack-ts <review request ts> --worktree <this checkout> \
     --deploy-channel <channel> --pipelines <p1,p2> --max-run-min <n> [--dev-check "<command>"]
   ```
   - `pick` exits 2 (no `deploy` yet): find the repo's dev pipelines in `#non-prod-ci-cd` (bot lines `<name>-codepipeline *SUCCEEDED*`, `*Application :*`), confirm them with the human once, and add `deploy` to `.claude/trust.json` (`references/trust-config.md`).
   - `--dev-check`: the runtime check from step 1 when it can run against dev without writing data; otherwise leave it out.
   - Then `/loop /rk:pr-follow-up <PR url>` (self-paced: 15 min in review, 5 min while waiting for the deploy; it stops itself when done, idle 24 h, or waiting on the human). The loop lives as long as this session; if the session must end, tell the human to run the same line in a new session in this checkout.
4. **Jira** (only when the loop implements a card), last because it asks the human for the hours: move the card to **In Review**, then `/rk:ef-logwork`. Do not close it while acceptance criteria outside this PR are open.
5. **Report**:
   ```
   Change: <one line> · Branch: <...> · Commit: <sha>
   Intent: <what was asked, what the diff does>
   Verified: <tiers from the receipt> · Red/green: <tests> · Runtime: <what was exercised>
   Not verified: <anything skipped and why>
   Decided by recommendation: <each pick, one line; only with --recommend>
   Open questions: <...>
   ```
   With `--recommend`, the PR description also lists those picks under "Decisions taken by recommendation", so reviewers see them.

## Credits
Adapted from the `trust-loop` workflow in core-foundry (Huy Nguyen): receipts bound to a working-tree fingerprint, red-on-old / green-on-new proof, intent review. This version is a generic rewrite driven by `.claude/trust.json`.
