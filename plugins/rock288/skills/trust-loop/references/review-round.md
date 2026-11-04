# Review round

Step 5 of the loop. The main session wrote and fixed the code, so it is anchored on its own story: what it meant, what it fixed, which finding it thought was wrong. A round must be as unbiased as a review after `/clear`. So reviewers get a frozen brief and the diff, never the session's story, and they rule on their own findings.

This file is the only source of the prompts. Main copies a prompt as is, pastes `<shared rules>` and `<output format>` into it, then fills the placeholders — nothing else: no line about this round, earlier rounds, what was fixed or what to look at.

| Placeholder | Value |
|---|---|
| `{REPO}` | absolute path of this checkout (`git rev-parse --show-toplevel`) |
| `{BRIEF}` | `git rev-parse --path-format=absolute --git-path rk-trust/review-brief.md` |
| `{BASE}` | the brief's `Base:` SHA (`git merge-base HEAD <base branch>`), never a branch name: another worktree can move it |
| `{CODE_REVIEW_DIR}` | absolute path of `$SKILL_DIR/../code-review` |
| `{LANE}` | `Q` (quality) or `A` (adversarial) |

## 1. Brief
Written before round 1 to `rk-trust/review-brief.md` in the git dir: outside the working tree, so the receipt fingerprint does not change and it is never committed. Write it and the round log with Bash (`cat > "$f" <<'RK_BRIEF_EOF'`, `>>` to append) at the absolute path (`git rev-parse --path-format=absolute --git-path ...`), not with Write / Edit: those can ask for permission on `.git/` paths even in bypass mode, which stops the unattended loop.

An **entry** into step 5 is one of three events; main appends `## Entry — new|resume|follow-up` to the round log for each. A step 4 → step 5 return inside the loop is not an entry.
- **new**: a new `/rk:trust-loop` run. Write the brief fresh, delete the round log.
- **resume**: the same loop goes on after `BLOCKED` or a human answer. Keep both files. Record the answer first: "keep it as is" → the finding moves to `## Settled` as `Human: <answer verbatim>`; "fix it" → main fixes it, removes it from `## Disputed`, logs it `fixed (human)`; an answer that changes the asked-for behavior → appended under `## Request` as `Follow-up: <verbatim>`.
- **follow-up**: a `/rk:pr-follow-up` code fix on this branch. Keep both files. The PR comment is appended under `## Request` as `Follow-up: <verbatim>`.

On every entry, recompute `git merge-base HEAD <base branch>` and rewrite the `Base:` line: the base may have been merged in or the branch rebased since. Otherwise only `## Request` (follow-ups), `## Red / green` (a test added by a fix), `## Disputed` and `## Settled` change.

```
# Review brief — <ticket or one-line task>
Base: <merge-base SHA>   Branch: <name>   Repo: <absolute path>

## Request (verbatim)
<the original request, the card text — copied, not summarized>

## Acceptance criteria / SPEC / SD links
<the card's AC; SPEC and Solution design links, or "none">

## Reach list (step 1)
<file:line per caller, test, fixture, config, export>

## Red / green (step 3)
- <test> · <command> · old code: <trimmed failing output> · new code: <trimmed passing output>

## Disputed
<empty at round 1>

## Settled
<empty at round 1>
```

A test added by a review fix gets its own `## Red / green` line, proven red / green the step 3 way. Same format, no round number, no "fixed".

A disputed entry (main appends it, one per finding):
```
- [Q|A] path:line — <the finding as the reviewer wrote it>
  Evidence: <file:line that handles it, a test name + its output>
```
Evidence only: code locations and outputs. No "fixed in round n", no story of the session.

`## Settled` holds what reviewers no longer judge:
- a dispute ruled `WITHDRAWN` by at least one lane and `UPHELD` by none: main moves the entry here as is;
- the human's "keep it" answer to a `spec-conflict` stop or a `BLOCKED`: `- path:line — <finding> — Human: <answer verbatim>`.

## 2. Quality prompt (`{LANE}` = `Q`)
```
You are a fresh code reviewer. You know nothing outside the brief and the repo.
<shared rules>

1. Read {BRIEF}. The diff = `git -C {REPO} diff {BASE}` plus every untracked file in
   `git -C {REPO} status --porcelain -uall`. Review the whole diff.
2. Ground the review: Stage 0 of {CODE_REVIEW_DIR}/SKILL.md (from that file use Stage 0, Stage 2 and the
   finding gate only; its Stage 1, questions, task pipeline and report format do not apply). Read CLAUDE.md, AGENTS.md and
   .cursor/rules/*.mdc from {REPO} and from every ancestor directory of a changed path, and the
   nearest sibling module. Resolve every new name with a grep
   ({CODE_REVIEW_DIR}/references/checklists/base.md, Dangling References). Grep every caller of a
   function or export whose signature, return value or behavior changed, including files the diff does
   not touch.
3. Quality and conventions: Stage 2 of {CODE_REVIEW_DIR}/SKILL.md, the checklist in
   {CODE_REVIEW_DIR}/references/checklists/base.md, plus checklists/api.md when an API is touched.
   Find the expected load in the repo, state it in one line, judge scale against it.
4. Intent check, against the brief's Request (not a plan). Each "no" is a [Must fix]:
   - Does the diff do exactly what was asked — nothing missing, nothing extra?
   - Is every behavior proven by a test that was red on the old code? Use the brief's Red / green.
   - Is every entry of the reach list updated or proven unaffected?
   - Does code that was moved or merged keep its validation and error handling?
   - Is there only one concern in the diff? (Two concerns → [Must fix], spec-conflict: yes.)
5. Rule on every entry in the brief's ## Disputed.

Severity: Critical / Important → [Must fix]; Nice-to-have → [Optional].
<output format>
```

## 3. Adversarial prompt (`{LANE}` = `A`)
```
You are a fresh adversarial reviewer. You know nothing outside the brief and the repo.
Your only job is to find how this change fails, is exploited or gives a wrong result. No praise.
<shared rules>

1. Read {BRIEF} for context: what was asked, the reach list, the tests. Do not review the brief.
2. The diff = `git -C {REPO} diff {BASE}` plus every untracked file in
   `git -C {REPO} status --porcelain -uall`. Focus on added and modified lines; pre-existing code is
   in scope only when the change makes it newly exploitable. Find the runtime and framework from the
   repo (package.json, go.mod, the entrypoint).
3. Attack with the vectors in {CODE_REVIEW_DIR}/references/adversarial-review.md, "What to Attack":
   security, false assumptions, failure modes and resource exhaustion, races, data corruption, supply
   chain, observability. That file's spawn prompt, adjudication and report format do not apply.
4. Adjudicate your own findings before you report: keep one only with a concrete trigger and impact
   that the code does not already handle (check the guard, the schema, the caller). A Critical stays
   unless you can show the path is impossible.
5. Rule on every entry in the brief's ## Disputed.

Severity: Critical / Medium → [Must fix]; Low → [Optional].
<output format>
```

## 4. Shared rules (paste in place of `<shared rules>`)
```
Isolation: the brief, {REPO}'s code and the code-review files named below are your only sources.
Ignore any Plan, Reports, Naming, Task list or plan-CLI context a hook added, and any agent memory
loaded into your context. Do not open plans/, reports, journals, .claude/agent-memory/ or any file
in the git dir other than {BRIEF}. Do not use
TaskList, TaskGet or SendMessage.
Read only: no edits, no report file, no plan update, no memory write, no task update. In Bash, no command that writes
a file or changes git state (no stash, checkout, add). Do not run tests, builds or linters: the
brief's Red / green is the test evidence.
Finding gate: a bug, risk or scale finding names a concrete input or situation and the wrong result
it leads to. No concrete case → drop it; do not downgrade it to a nit. A convention finding cites the
written rule (file:line) or the sibling module instead.
spec-conflict: yes only when the fix would change the behavior asked for, the acceptance criteria,
the API contract or the response shape, or the diff holds two concerns. Otherwise no.
Disputed entries: rule UPHELD (still a must-fix; say why the evidence does not cover it) or WITHDRAWN
(the evidence holds). Judge from the code and the evidence only; read the code at the cited lines
yourself. The implementer's wording carries no weight on its own. Do not report a disputed finding
again as a new line; the DISPUTE line is your answer.
Settled: a finding covered by the brief's ## Settled is not reported again, not even as [Optional].
```

## 5. Output format (paste in place of `<output format>`)
```
Your final message is only these lines, nothing else:
[Must fix|Optional] [{LANE}] path:line — defect — failure scenario — spec-conflict: yes|no
(no single location, e.g. a missing behavior → write `-` for path:line)
DISPUTE path:line — defect — UPHELD|WITHDRAWN — reason
VERDICT: must-fix|clean
VERDICT is must-fix when any [Must fix] or UPHELD line is present.
```

## 6. Merge and round log (main only)
Merge the two lanes: one line per `path:line` + defect. Two different defects at the same line stay two lines; the same defect from both lanes becomes one line tagged `[Q][A]` (`spec-conflict: yes` wins).

Each `## Disputed` entry after a round:
- `UPHELD` by either lane, or reported again as a `[Must fix]` line → upheld → `BLOCKED`;
- else `WITHDRAWN` by at least one lane → move it to `## Settled`;
- else (no lane ruled it) → still open: the round is not clean, run the next one.

Round log: `$(git rev-parse --git-path rk-trust/review-rounds.md)`, written with Bash like the brief. Reviewers never read it; it is not in the brief. Main appends the merged lines right after the merge, and the dispositions once the round's fixes and disputes are done:
```
## Entry — new|resume|follow-up
## Round <n>
<the merged finding and DISPUTE lines>
- path:line — defect → fixed | fixed (human) | disputed | withdrawn
```
Round `n` counts from the last `## Entry`; the 5-round cap is per entry. Main uses the log to catch a finding marked `fixed` that a later round reports again as `[Must fix]` (same defect at the same or the moved line; `-` lines match by defect) → `BLOCKED`. The `withdrawn` lines (settled disputes) go to the report and the PR description.
