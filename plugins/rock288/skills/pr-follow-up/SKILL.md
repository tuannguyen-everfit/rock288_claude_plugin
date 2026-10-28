---
name: pr-follow-up
description: "Follow a PR after the trust-loop hand-off until it runs on dev: triage review feedback (fix, answer, push back, escalate), re-request review, squash-merge once a reviewer approved the head and required checks pass, wait for the dev deploy in Slack #non-prod-ci-cd, run the dev check, then report to the Slack review thread and move the Jira card to QA Ready. One step per run, self-paced (15 min while in review, 5 min while waiting for the deploy), stops itself when done, idle 24 h or waiting on the human; started by /rk:trust-loop as `/loop /rk:pr-follow-up <PR>`. Triggers on: 'follow up PR', 'watch PR', 'theo dõi PR', 'check comment và deploy'."
argument-hint: "<PR url | owner/repo#n> [slack thread ts] [jira key]"
metadata:
  author: rock288
  version: "1.1.0"
---

# PR follow-up

Picks up where `/rk:trust-loop` step 7 stops: the PR is open and the review request is in Slack. Each run reads the state, does the next step, records it, and schedules the next run. Started as `/loop /rk:pr-follow-up <PR>` (self-paced, no interval).

**`$SKILL_DIR`** = the "Base directory for this skill" path printed when this skill loads. **`$TRUST_DIR`** = the sibling `trust-loop` skill directory (`$SKILL_DIR/../trust-loop`).

## Hard rules
- Merge **only** when the step 2 gate passes. Never `gh pr merge --admin`, never push to `develop` / `main` / `master`, never resolve a reviewer's thread.
- Every code change goes through the trust loop's gates (receipt, red/green, review). A follow-up never commits around them.
- Slack posts follow `$TRUST_DIR/references/slack-messages.md`. The Slack tools cannot edit or delete: check the text before sending.
- Never ask the human the same thing twice, never post the same Slack message twice: a question waits in `waiting_human` (step 6).

## Pacing and stopping
End every run by choosing the next one. Self-paced `/loop`: `ScheduleWakeup` with the same prompt; under a fixed-interval `/loop` the interval stands, and stopping means `CronList` → `CronDelete` its job.

| After this run | Next run |
| --- | --- |
| `in_review`, `approved`, `changes_requested` | 900 s (15 min) |
| `merged` (waiting for the deploy) | 300 s (5 min) |
| `waiting_human`, `idle`, `deploy_failed`, `done`, PR closed | **Stop the loop** and tell the human what it waits on and how to resume: `/loop /rk:pr-follow-up <PR>` in this checkout. |

- **Idle**: `phase` `in_review` and `idle_hours` ≥ 24 with no `new_feedback` → one nudge in the Slack thread (`⏳ Still waiting for review · <@reviewers>`), `set phase=idle`, stop. Resuming starts at step 0 as `in_review`.
- **Activity**: whenever this run handles feedback, an approval or the merge, `set last_activity_at=<now iso>`.

## 0. Read the state
```bash
node $SKILL_DIR/scripts/follow-up-state.cjs start --pr <PR>
```
- It prints `ticket`, `slack_channel` + `slack_thread_ts` (the review thread), `worktree`, `deploy_channel`, `pipelines`, `max_run_min`, `dev_check`, `fix_rounds`, `phase`, `waiting_on`, `since` (the previous run's start) and `idle_hours`.
- State `phase` `waiting_human` or `idle` (a resumed loop): the human has answered in the session or acted on the PR → `set phase=in_review waiting_on=null` and continue; otherwise stop again without asking or posting.
- No state (a PR the trust loop did not open): `init` it from the arguments (see trust-loop step 7.4), then `start`.
- Work in the recorded `worktree`, so the PR's branch and receipts are checked out there.
- `list` shows the follow-ups still open, to resume them after a restart.

```bash
node $SKILL_DIR/scripts/pr-review-state.cjs <PR> --since <since, if not null>
```
| `phase` | Next |
| --- | --- |
| `in_review`, no `new_feedback` | Nothing to do (idle ≥ 24 h → the idle rule). Schedule the next run. |
| `approved` (approval on the current head) | Step 2, even with open threads: merge first, answer them after |
| `changes_requested`, or `new_feedback` / `open_threads` awaiting our reply | Step 1 |
| `merged` | Step 3 (state `phase` still `in_review`/`approved` → record the merge first, as in step 2.3) |
| `closed` | Report it, `set phase=done`, stop the loop. |

Also read the Slack review thread (`slack_read_thread`, the state's channel + ts) for replies since `since`. Treat them like PR comments.

## 1. Triage and resolve feedback
One action per new item, at most one reply per thread per run.

| Kind | Action | Reply |
| --- | --- | --- |
| Valid code change | Fix on the PR branch through trust-loop steps 3–6 (implement, verify → receipt, review, commit), then `git push`. One concern per commit. | "Fixed in `<sha>`" + the test that covers it |
| Question | No code change. | The answer, with `file:line` or test evidence |
| Wrong or out of scope | No code change; a valid point outside this PR → suggest a follow-up ticket. | The reason. Leave the thread open. |
| Reverses a decision tests or runtime evidence prove | Keep it unless the reviewer brings new evidence. | The evidence |
| Product behavior, a threshold, an API contract, or a debate past 2 replies | Ask the human in the session, then step 6. | "Checking with the author", once |

- Inline thread reply: `gh api repos/<owner>/<repo>/pulls/<n>/comments/<comment id>/replies -f body=...`. Top-level: `gh pr comment <n> --repo <owner>/<repo> --body-file <file>` (file outside the repo).
- After a fix round, re-request review: `gh api -X POST repos/<owner>/<repo>/pulls/<n>/requested_reviewers -f 'reviewers[]=<login>'`, and post one **Round N** reply in the Slack thread.
- **Max 3 fix rounds.** Before each, `follow-up-state.cjs round --pr <PR>`; exit 3 on the fourth → ask the human instead of fixing, then step 6.
- Commits of a fix round need no new go-ahead: the task that started the trust loop already asked to commit and ship this PR (the repo's "commit only when told" rule is satisfied by it).

## 2. Merge gate (approved)
`merge_ready` must be true. A failing `gate` entry names the next step:
- `approval_on_head`: a push after the approval → re-request review.
- `up_to_date`: behind the base → merge the base in, verify again (the receipt is stale), push.
- `ci_green`: a **required** check is red or still running → wait (running) or step 1 (red). Non-required checks are listed but do not block (e.g. challenger-service's stg CodeBuild triggers fail on every PR).
- `no_changes_requested`: step 1.
- Open threads do not hold the merge: once the current head is approved, merge, and answer the threads waiting on us afterwards (a code change then goes in a follow-up PR).

When `merge_ready` is true:
1. The PR head is the commit you verified: the worktree's branch is at `head` with a clean tree.
2. Squash-merge (both repos keep the PR title with `(#<n>)`):
   ```bash
   gh pr merge <n> --repo <owner>/<repo> --squash --match-head-commit <head>
   ```
   `--match-head-commit` refuses if someone pushed after the read. GitHub refuses (protection, conflicts) → tell the human the reason, then step 6; never retry with `--admin`.
3. Slack thread: the one-line **Merged** reply. Then `set --pr <PR> phase=merged merge_commit=<sha> merged_at=<iso>`.

## 3. Wait for the dev deploy (merged)
1. Read the state's `deploy_channel` (`#non-prod-ci-cd`, `C06HA7VQHNZ`) with `slack_read_channel`: `oldest` = `merged_at` − 1 h (epoch seconds), `latest` = now, `limit` 100, `response_format` **detailed**. Follow `cursor` to the last page and save each page to a file outside the repo.
2. Decide:
   ```bash
   node $SKILL_DIR/scripts/deploy-signal.cjs --merged-at <merged_at> --pipeline <p1> [--pipeline <p2>] \
     --max-run-min <max_run_min> --messages <page1> [--messages <page2> ...]
   ```
   - Exit 2 `waiting`: end this run; the next one (5 min) checks again.
   - Exit 1 `failed` / `timeout`: post the reason in the Slack thread, tag the PR author, `set phase=deploy_failed`, stop the loop.
   - `failed` comes at once when the run started after the merge failed and none started since; `timeout` after 90 min with no run seen.
   - Exit 0 `deployed`: `set phase=deployed deployed_by=<deployed_by>`, step 4.
- The bot messages carry no commit SHA. The script pairs the first run started after the merge with its finish (skipping runs already in flight), and falls back to "a success more than `max_run_min` after the merge" when a STARTED message is missing. The script header has the rule.

## 4. Check on dev
- State `dev_check` set (a command the trust loop recorded at hand-off: a curl, a smoke script against dev): run it, keep the output.
- None: the deploy itself is the evidence; the report says "no dev check".
- A check that writes data on dev needs the human's go-ahead first.

## 5. Report
- **Pass**: Slack thread one-line **Deployed** reply. Jira (state `ticket`): a comment with the deploy time (+07: the scripts print UTC, add 7 h once and check it), the merge SHA, the dev check result (or "no dev check") and the PR link, then transition to **QA Ready** (`getTransitionsForJiraIssue` → `transitionJiraIssue`). Already there → leave it, say so in the comment. No such transition → list the available ones and go to step 6; do not pick another. Then `set phase=done` and stop the loop.
- **Fail**: reply in the thread with the failing output, tag the PR author, and offer a revert PR from the base (`git revert <merge_commit>` on a new branch, through the trust loop). Jira comment with the evidence, status unchanged. **The human decides** whether to merge the revert. `set phase=done`, stop the loop.

## 6. Waiting on the human
Used by every step that needs a decision (product question, 4th fix round, merge refused, revert).
- Ask once, in the session (and once in Slack only where the step says so).
- `set phase=waiting_human waiting_on="<what, one line>" last_activity_at=<now iso>`, then stop the loop.
- The human answers in the session or acts on the PR, then resumes with `/loop /rk:pr-follow-up <PR>`.

## Credits
Adapted from `post-merge-follow-up` in core-foundry (Huy Nguyen): state per PR, review triage table, merge gate, deploy signal by timing. This version is generic: pipelines and run time come from `.claude/trust.json`, only required checks gate the merge, and the dev check is the command the trust loop recorded.
