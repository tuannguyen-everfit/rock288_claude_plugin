---
name: trust-loop
description: "Verified delivery loop for a code change in any repo: intake, pre-flight baseline, design (brainstorm/plan when needed), implement with red-on-old / green-on-new tests, programmatic verification that writes a receipt bound to the exact working tree, adversarial + intent review, a commit only on a passing receipt, then the hand-off (PR, review request, Jira). Use for features, bug fixes and refactors when the output must be proven, not just reviewed. Triggers on: 'trust loop', 'verified change', 'implement and verify', 'làm có kiểm chứng'."
argument-hint: "<task | bug report | Jira card> [--init] [--recommend]"
effort: medium
metadata:
  author: rock288
  version: "1.15.0"
---

# Trust Loop

The human is the **architect**: sets intent, approves constraints, reads intent summaries, approves PRs. The agent locates, builds, verifies and reviews inside the repo's gates. Trust comes from verification evidence, not from a review score.

**`$SKILL_DIR`** = the "Base directory for this skill" path printed when this skill loads.

**`--recommend`**: no picker for the whole loop. Every question this loop or a skill it calls would ask with a `(Recommended)` option is taken by that option: the intake scope or split, the hand-off (the defaults), and the design choices (pass `--recommend` on to `/rk:brainstorm` and `/rk:plan` in step 2). State each pick in chat (`Decision <n> — <question> → <pick>: <why, one line>`), go on, and list it in the report and the PR. It still stops only for what has no recommendation: a fact only the human knows, `BLOCKED`, a red required baseline tier, the env gate (step 2), a review finding that would change the SPEC (step 5).

**Effort**: the loop itself runs at `medium` (frontmatter): intake, coding, verify. The frontmatter holds for the current turn only: after a plain-text human reply the session level is back, so ask through `AskUserQuestion` to stay in the turn, or the human runs `/effort medium`. Judgement runs at `high` in subagents: `/rk:plan --effort=high` (planner) and the review rounds, which spawn `rk:code-reviewer` agents with `effort: "high"` (step 5).

**Defer first:** if the repo has its own `.claude/skills/trust-loop/` (e.g. core-foundry), stop and run that one: `/trust-loop <task>`. Its tooling is stricter than this generic loop.

## Hard rules
- No commit without `verify-change --status` → `ok: true` for the current content. Any edit after verifying invalidates the receipt.
- Never weaken a test, a lint rule or a tier in `.claude/trust.json` to get green. A gate you believe is wrong is a question for the human.
- A new env var (a `default.env` key, a config schema entry, a deploy secret) is the human's answer: never invent its name or value, even with `--recommend`.
- Review fixes never change the SPEC: the original request, the card's acceptance criteria, the approved plan.
- Never `--no-verify`, never push to a protected branch. Repo rules win when stricter: a repo whose rules say "commit / push only when the human says so" gets the diff and a wait at step 6, unless the task itself asked to commit or ship.
- The loop runs unattended: `/rk:cook` with `--auto`. The loop's own gates (receipt, red/green, review) hold the change, not approval clicks. Cook's finalize does not commit; the loop commits at step 6.
- Heavy suites run only through `verify-change`, in the foreground. It allows one run per machine (other sessions wait on its lock), caps parallelism (`NX_PARALLEL=1`, `GOFLAGS -p=<half the cores>`) and kills a tier's whole process group on timeout. A full suite run by hand (`nx run-many`, `--skip-nx-cache`, `go test -race ./...`), or `verify-change` in the background, bypasses that and lets two sessions freeze the machine. For a single test file, run that file only.

## 0. Intake
- Restate the task in one sentence. Unclear intent → ask now (one round, specific questions); do not discover it in review. With `--recommend`, a question that has a recommended answer (scope, which part of a card goes first, one loop or two) is decided, not asked.
- Jira card → `/rk:ef-branch-name <card>` for the branch. Otherwise branch off the base yourself; never work on a protected branch.
- Jira card → move it to **In Progress** once the branch exists (`getTransitionsForJiraIssue` → `transitionJiraIssue`). Already In Progress or later → leave it. No such transition (e.g. no sprint) → note it for the report and go on; do not pick another.
- No `.claude/trust.json` (or `--init`): draft it with `node $SKILL_DIR/scripts/init-config.cjs --print`, cross-check it against the repo's `CLAUDE.md` / CI gates, show it to the human, then write it (drop `--print`). Format: `references/trust-config.md`. Writing it also adds it to `.git/info/exclude` (unless the repo tracks or ignores it): it holds this machine's commands, and step 6's `git add -A` must not ship it in the PR. Committing it for the team is the human's call, in its own commit.
- Session artifacts: `plans/`, `docs/journals/` or `.claude/agent-memory/` (subagent memory) not ignored by the repo → add them to `.git/info/exclude` once, so plans, reports, journals and agent memory stay out of the commit (`git add -A`) and of the receipt.
- Settle the hand-off now so the loop runs to the PR without stopping: confirm once the Slack channel and reviewers (or "no Slack"), and the SPEC and Solution design links the PR body needs (from the card first; ask only for the missing ones, "none" is an answer), unless the task already says. Defaults: `#backend-review-code`, `Quang Pham Minh (BE)` (`<@U0BQ2JFBKGD>`) + `Huy (BE)` (`<@U0142122SJD>`). With `--recommend`, take the defaults without asking. That answer (or `--recommend`) is the go-ahead for step 7.

## 1. Pre-flight
- Locate the change: the call chain as `file:line`, where its unit test lives, async boundaries, and **the runtime check that will prove the change** (an e2e test, a smoke script, a real call). `/rk:scout` for wide searches.
- **Reach list**: every caller of a function whose signature, return value or behavior will change (grep, including files you would not otherwise touch), plus the tests, fixtures, config and exports that must follow. That list is the scope; anything outside it is extra.
- **Reach outside the repo**: the names this change alters that another repo can depend on — an HTTP route and its request / response fields, an event / queue / topic name and its payload fields, a DB collection and its fields, an env var name, an export of a shared package. Grep each (fixed string, the qualified form first: route path, `collection.field`, event name) in the sibling repos: the git repos in the directory that holds the MAIN checkout (`git rev-parse --path-format=absolute --git-common-dir` → its parent is the main checkout → that one's parent; a linked worktree's own parent is not it), skipping `node_modules`, `dist`, `.git` and vendored code. Read only: never edit there. Record `repo:file:line` per consumer, or `none found (searched: <dirs>)`; a bare name too generic to grep (`status`, `id`) → say so instead of listing the flood. A consumer that would **break** (a field removed, renamed or retyped, its meaning changed, a new required input) → `BLOCKED` with the list, also with `--recommend`: the other repo is its own loop. Compatible (additive, optional) → keep the list for the brief and the PR, and go on.
- E2e tests only where the repo already has an e2e suite (an `e2e/` dir or `*-e2e` project, a `make e2e` / `nx e2e` target, an `e2e` tier). None → do not write or scaffold e2e: prove the change with unit tests plus a runtime call when one is possible, and put `no e2e suite in this repo` under "Not verified".
- **Baseline** on the clean base before any edit: `node $SKILL_DIR/scripts/verify-change.cjs --baseline`. A tier scoped to the change (`{files}` / `{go_packages}` placeholders, `nx affected`, `git diff` lint) runs nothing on a clean base: that is a pass, not a gap — do not run the full suite by hand to make up for it. A **required** tier already failing would block the receipt later: write it down and decide with the human — fix it first in its own commit, or keep this change away from it. An optional tier already failing (e.g. e2e checks red on the base) blocks nothing: write down which checks fail, so step 4 can show the change adds none, and go on.
- Cross-boundary change (two services, API + client, schema + reader)? Write the contract and the order both sides change in.

## 2. Design and plan
- Intent clear and single-file with an obvious cause → skip to step 3.
- Several viable designs or vague requirements → `/rk:brainstorm` (`--recommend` when this loop has it); its decision feeds the plan.
- **Env gate**, after the brainstorm and before `/rk:plan` (step 2 skipped → before step 3): list every new env var the change needs — name, purpose, default, dev / prod value, secret or not — and ask the human in one question. `--recommend` does not answer it. The answers go into the plan. None needed → state `no new env` and go on. An env var not on the approved list that turns up later (step 3, 5) → stop and ask; do not invent it.
- Multi-file feature → `/rk:plan` (`--effort=high`; `--recommend` when this loop has it). The plan must name the files, **the test that proves each behavior**, and the runtime check from step 1.
- Bug → reproduce first: a failing unit test or a runtime call before the fix (`/rk:debug` for hard ones). Fix the root cause once in the shared code, not in the one caller that reported it.
- One concern per loop. A plan that does two things becomes two loops.

## 3. Implement
- Small change: main session. Plan with phases: `/rk:cook <plan> --auto` (all phases in one go; it stops only on critical review issues left after 3 fixes).
- Follow the repo's `CLAUDE.md` and rule files; new code goes where the feature already lives.
- Least new code: take the first that fully works — not needed at all → already in this repo (a helper, service, pattern) → the standard library or platform → an installed dependency → only then new code. Never add a dependency for a few lines.
- Tests ship with the change and each must **fail on the old code and pass on the new**. Prove it once and keep both outputs:
  ```bash
  git stash push -m "trust-loop red <ticket>" -- <source files only>   # keep the new tests in place
  <run the new tests>   # must FAIL
  git stash list --format='%H %gs'                                     # find the entry by its tag
  git stash apply <sha> && git stash drop <its stash@{n}>
  <run the new tests>   # must PASS
  ```

## 4. Verify and self-correct
- `node $SKILL_DIR/scripts/verify-change.cjs` runs every tier in `.claude/trust.json` (scoped tiers only on the changed files: `references/trust-config.md`) and writes a receipt for the exact working tree (logs under the git dir; the path is printed). `waiting: verify-change is running for <repo>` = another session holds the machine lock; let it wait, do not kill it or run the tiers by hand.
- A tier fails → fix it in the change's own files and run again, **max 3 iterations**. While iterating, `--skip=<slow optional tiers>` (e.g. `coverage,e2e`); the last verify before the commit runs them. Still red → `BLOCKED`: stop, report the failing output, change approach or ask the human. Do not push through.
- A tier that rewrites files (formatter) leaves no receipt: review its edit, then verify again.
- Runtime evidence the tiers do not cover (e2e, a smoke against a local server, a real API call): run it yourself and keep the output for the PR. Say plainly what could not be exercised and why.
- Write reports and notes **before** the final verify: a new untracked file changes the fingerprint.

## 5. Review
Each round runs in fresh subagents that never see this session: they get the frozen brief and the diff, nothing else. Review → fix → verify → review again, until a round finds only Nice-to-have. **Max 5 rounds.** The brief, the prompts, the intent check and the finding format: `references/review-round.md`. Do not call `/rk:code-review` here: its Stage 0 and adjudication would run in this session.

Before round 1 (after the step 4 receipt passes): write the brief to `git rev-parse --path-format=absolute --git-path rk-trust/review-brief.md`, with Bash, not Write / Edit (`.git/` paths can prompt even in bypass mode) — the original request verbatim, the card's AC and SPEC / SD links, the step 1 reach list, the step 3 red / green outputs, the base as a merge-base SHA, the branch. A new run writes it fresh and deletes the round log; a resume (after `BLOCKED` or a human answer) or a `/rk:pr-follow-up` fix keeps both, records the human's answer or the new request, and recomputes the base (`references/review-round.md` §1, entries). After this only the follow-up requests, `## Red / green` (a test added by a fix), `## Disputed` and `## Settled` grow. Both files sit in the git dir: the receipt stays valid and nothing gets committed.

Each round:
1. In one message, spawn two new `rk:code-reviewer` agents with `effort: "high"`: **quality** (Stage 0, conventions, the intent check) and **adversarial**. Prompts from `references/review-round.md`, only the placeholders filled: no line about this round, earlier rounds or what was fixed. Both review the whole diff against the base, every round; no fix-diff-only re-review.
2. Merge the two lanes by `file:line` + defect and append them to the round log `rk-trust/review-rounds.md` in the git dir (only this session reads it); the dispositions follow once items 5–6 are done.
3. A disputed finding ruled `UPHELD`, or a finding the round log shows fixed comes back as `[Must fix]` → `BLOCKED`: stop; do not fix it to keep the loop going.
4. No `[Must fix]` and `## Disputed` empty (a withdrawn dispute moves to `## Settled`; one no lane ruled stays open) → step 6. `[Optional]` and the settled disputes go to the PR description and the report; the loop does not fix them.
5. A `[Must fix]` marked `spec-conflict: yes` → do not fix it. Stop and show the human the finding, the SPEC line it conflicts with, and what happens if it stays. Also with `--recommend`. "Keep it" goes into the brief's `## Settled` verbatim, so the next round does not raise it again; an answer that changes the behavior goes under `## Request` as a follow-up.
6. Every other `[Must fix]` is fixed in the change's own files; a test added for it goes into the brief's `## Red / green`. Believe one is wrong? Never drop it: append it to the brief's `## Disputed` with the evidence (`file:line`, test output). Code changed → step 4 (the receipt is now stale) → next round; only disputes → next round.

`BLOCKED` (stop, report the open findings): item 3; round 5 ends with a `[Must fix]` or an open dispute (a fix after round 5 would ship unreviewed). The cap counts rounds since the last entry (a new run, a resume, a follow-up fix); a step 4 → step 5 return is not an entry.

The same correction a second time → propose turning it into a mechanical check (a lint rule, a test, a tier) as a separate change.

## 6. Commit
Commit as soon as the receipt passes; the receipt is the gate, not a human. Check and commit in one command so nothing changes in between:
```bash
node $SKILL_DIR/scripts/verify-change.cjs --status && git add -A && git commit -m "<subject>" -m "<body>"
```
- Subject = the repo's rule (e.g. `type(scope): CARD summary`). Body: intent summary + how it was verified (tiers + runtime evidence). Pass the message inline: a message file inside the repo is untracked content and makes the receipt stale.
- `--status` refuses while `.claude/trust.json` is untracked and not ignored (`git add -A` would commit it): add it to the file `git rev-parse --git-path info/exclude` prints, verify again. Never commit it inside the change.
- A pre-commit hook fails → fix, back to step 4. Never `--no-verify`.
- Exception (hard rules): the repo forbids auto-commit and the task did not ask to commit → show the diff and the message, wait.

## 7. Hand-off
Runs right after the commit when the hand-off was settled at intake; otherwise confirm once with the human before the first step.
1. **PR**: `/rk:ef-ship --feature=<scope> --subtitle=<subtitle> --spec=<url> --sd=<url> --yes` with the commit's scope and subtitle: it pushes the commit, opens the PR against the base and chains `/rk:ef-pr-description`. Do not pass its `--slack` flags; step 2 posts the review request. The body carries a verification table — per test: old code red / new code green — the receipt tiers, runtime evidence, an **Impact** section (the consumers outside the repo from step 1 and why each still works, or `no consumer outside this repo (searched: <dirs>)`), and what is not in this PR.
2. **Review request**: the channel and reviewers settled at intake; the evidence goes in the PR or the thread, not only in chat. Every Slack post (request, evidence, review round, merged, deployed) follows `references/slack-messages.md`: short verdict lines, no tables, no receipt hashes; the detail stays in the PR. The follow-up is not set up here: the Slack bot sees the review thread, records the follow-up state itself and runs `/rk:pr-follow-up` (review, merge, dev deploy). Do not run `follow-up-state.cjs`, ask for deploy pipelines or start `/loop` from this session.
3. **Jira** (only when the loop implements a card): move the card to **In Review**. Do not log work: the human logs it with `/rk:ef-logwork`. Do not close the card while acceptance criteria outside this PR are open.
4. **Report**:
   ```
   Change: <one line> · Branch: <...> · Commit: <sha>
   Intent: <what was asked, what the diff does>
   Verified: <tiers from the receipt> · Red/green: <tests> · Runtime: <what was exercised>
   Not verified: <anything skipped and why>
   Impact: <n> consumers outside the repo · <repos>, or none (searched: <dirs>)
   Review: <n> rounds · fixed <k> · disputes settled <d> · optional left <m>
   Decided by recommendation: <each pick, one line; only with --recommend>
   Open questions: <...>
   ```
   With `--recommend`, the PR description also lists those picks under "Decisions taken by recommendation", so reviewers see them.

## Credits
Adapted from the `trust-loop` workflow in core-foundry (Huy Nguyen): receipts bound to a working-tree fingerprint, red-on-old / green-on-new proof, intent review. This version is a generic rewrite driven by `.claude/trust.json`. Reach list, least-new-code order and root-cause-in-shared-code from ponytail (Dietrich Gebert).
