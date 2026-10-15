---
name: ef-pr-comment
description: "Post findings from /rk:code-review as inline PR review comments anchored to exact file:line locations, each labelled [Must fix] (Critical/Important) or [Optional] (Nice-to-have). Use AFTER a code review when the user wants the findings (all buckets by default, or chosen ones) pushed to GitHub as inline comments. Triggers on: comment to pr, post review inline, push findings to pr, drop comments on pr."
argument-hint: "[#PR | PR-URL] [--severity=important,critical,niceto]"
metadata:
  author: rock288
  version: "1.1.0"
---

# PR Inline Comment

Convert review findings into GitHub inline PR review comments anchored to the exact `file:line` where the issue lives. Every comment opens with its label — `**[Must fix]**` (Critical / Important) or `**[Optional]**` (Nice-to-have) — so the PR author knows which ones block the merge. Default selection is **every** bucket; the user can deselect.

## When to use

- Right after `/rk:code-review` finished and findings are in the conversation context.
- User says: *"comment the Important items into the PR"*, *"post the review inline"*, *"drop comments on PR #N"*, Vietnamese variants (*"comment code cho pr"*, *"đẩy review vào PR"*).
- **NOT for:** top-level PR summary comments (use `gh pr comment`), code edits, or creating GitHub issues.

## Inputs

| Arg | Meaning |
|---|---|
| `#NNN` or `https://github.com/.../pull/NNN[/...]` | PR number — required if branch is not linked to a PR |
| `--severity=critical,important,niceto` | Pre-select severity buckets (default: all three) |
| *(no args)* | Resolve PR from current branch; default to all buckets |

## Findings shape

Each finding from `/rk:code-review` must surface, before this skill runs:

```
ID:         I1
Severity:   important
File:       internal/features/challenge/service.go
Lines:      43-48      (or single line: 45)
Title:      Duplicated godoc on Status type
Body:       <markdown comment body, including code blocks>
```

If findings are NOT yet in context, STOP and ask the user to run `/rk:code-review` first, or to paste findings in the format above.

## Workflow

### 1. Resolve PR + repo

```bash
# If user passed #N or URL, parse PR number first.
PR_NUMBER=<from arg or `gh pr view --json number -q .number`>
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
HEAD_SHA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefOid -q .headRefOid)
```

Confirm with user once: *"Posting to {REPO} PR #{N} @ {HEAD_SHA:0:7}"*.

### 2. Select findings (interactive)

Use `AskUserQuestion` with `multiSelect: true`. Header: `Post findings`. List every finding (Critical, Important and Nice-to-have) with its label in the description; the user deselects what to hold back. Cap at 8 options per question — chunk if more.

```
question: "Which findings to post inline on PR #N?"
options:
  - label: "I1 — Duplicated godoc on Status"
    description: "service.go:43-48 (Important → [Must fix])"
  - label: "N1 — Inline the single-use helper"
    description: "handler.go:45 (Nice-to-have → [Optional])"
  ...
```

If `--severity=...` is passed, skip the prompt and select all matching findings.

### 3. Build the review payload

Write to a temp file (`/tmp/pr-{N}-review.json`) — avoids shell-escaping markdown bodies.

```json
{
  "commit_id": "<HEAD_SHA>",
  "event": "COMMENT",
  "body": "2 must fix, 5 optional.",
  "comments": [
    {
      "path": "<file path relative to repo root>",
      "line": <N>,                  // single-line form
      "side": "RIGHT",
      "body": "<markdown body>"
    },
    {
      "path": "<file>",
      "start_line": <START>,        // multi-line form
      "line": <END>,
      "start_side": "RIGHT",
      "side": "RIGHT",
      "body": "<markdown body>"
    }
  ]
}
```

Rules:
- **`line` = LAST line of the range**; `start_line` = first. Both `RIGHT` (new code).
- Single-line finding → omit `start_line` + `start_side`.
- `path` must be repo-root-relative POSIX (the PR diff path), not absolute.
- Comment body is markdown — code fences, links, lists all render.
- **Every body starts with its severity label** — see "Severity label" below.
- Review `body` = the counts of what this review posts, e.g. `"2 must fix, 5 optional."` (only the buckets present: `"3 optional."`).
- **Write as a human reviewer would.** See "Comment voice" below — strict rules.

### 4. Post the review

```bash
gh api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --method POST \
  --input /tmp/pr-$PR_NUMBER-review.json
```

Parse the response — extract `html_url`. Show it back to the user as the result.

### 5. Cleanup

Delete the temp payload (`rm /tmp/pr-$PR_NUMBER-review.json`) unless the request failed and the user needs to retry.

## Severity label (mandatory)

Each comment body opens with exactly one label, bold, followed by a space and the observation on the same line:

| Finding severity | Label | Meaning for the PR author |
|---|---|---|
| Critical | `**[Must fix]**` | blocks the merge |
| Important | `**[Must fix]**` | blocks the merge |
| Nice-to-have | `**[Optional]**` | take it or leave it; never blocks |

- The labels are fixed English strings in every repo, whatever the review language, so they can be scanned and grepped. They match the `MUST_FIX` / `OPTIONAL` counts a caller reports.
- No other severity wording (`Important`, `Critical`, `nit`, emoji) — the label is the only marker.

```
**[Must fix]** `ch` comes from `GetChallenge`, which is cached for 5 min, so …
**[Optional]** This helper has one caller; inline it until a second one lands.
```

## Comment voice — write like a human reviewer

The body that lands on the PR must look like a real human teammate wrote it. Reviewers reading the PR shouldn't be able to tell it came from a tool. **Hard rules:**

- ❌ **Never mention skill, agent, command, or tool names.** No `/rk:code-review`, `/rk:`, `claude`, `code-reviewer`, `subagent`, etc.
- ❌ **No internal finding IDs.** No `I1`, `C2`, `N3`, `Finding 4`, "from the review", "per the audit", etc.
- ❌ **No severity wording other than the label.** Don't write `**Important**`, `**Critical** —`, `(nit)`; the `[Must fix]` / `[Optional]` label already says it.
- ❌ **No "the review surfaced…", "I noticed during review…", "automated check found…"** framing.
- ❌ **No top-level review `body` with a tool summary.** It carries the counts only (`"2 must fix, 5 optional."`).
- ✅ **Label, then the observation.** What's wrong, in one sentence. Then evidence, then the suggested fix.
- ✅ **Cite repo rules / RFCs / standards by their own name**, not by who flagged it. e.g. *"`.claude/rules/mongo.md` §6 forbids this — fix the struct tag instead."*
- ✅ **Code blocks for the suggested fix** when it's short.
- ✅ **Match the repo's review language** (English unless the repo's history is otherwise).
- ✅ **Be direct, concise, technical.** No hedging ("might want to consider"). No performative niceness ("Great work! One small nit:"). Land the point.

### Body length

- Single-line nit (typo, duplicated line): **1 sentence**.
- Behavior bug / API mismatch: **2–4 sentences + optional code block**.
- Design-level (semantics, contract): **a short paragraph + the choice list** (pick one of: …). Cap ~150 words.

### Good vs. bad — paired examples

**Bad (skill-leak + ID + severity wording instead of the label):**
> **I1 — Duplicated godoc on Status** (Important)
>
> Per `/rk:code-review`: this 3-line block is duplicated. Fix.

**Good:**
> **[Must fix]** This doc comment is duplicated — the same three lines appear at 43–45 and 46–48. Drop one block.

**Bad:**
> **I3 — Violates `.claude/rules/mongo.md` §6 STOP rule.** (Important — from automated review)
>
> The /rk:code-review skill flagged this delete() workaround.

**Good:**
> **[Must fix]** `omitempty` is already on `_id` and `created_at` (`service.go:87, :109`) — the `delete()` calls are only needed because `buildSeeds()` assigns a non-zero `ID: seedID` and `CreatedAt: now`. Cleaner: keep `seedID` as a local for the filter, leave `ch.ID` zero, drop `CreatedAt` from the struct literal. `$setOnInsert` already owns it. `.claude/rules/mongo.md` §6 has the rationale.

**Bad:**
> **I6 (Important):** `days_left` undefined for `coming_soon`. The Stage-3 adversarial pass caught this.

**Good:**
> **[Must fix]** For a challenge with `starts_at > now`, this still returns `{kind: "days_left", days: N}` — counting down to `ends_at` before the challenge has started. Lifecycle was moved client-side per the `Status` doc; the server probably shouldn't ship `days_left` at all, or should return `coming_soon` when `now < starts_at`. Worth picking one.

### When the underlying finding spans something larger than one anchor

If the issue can't be expressed as a clean code-line suggestion (e.g. a migration risk, a missing index drop, a contract break across endpoints), DON'T squeeze it into an inline comment. Either:
- Skip it from the inline batch and surface in chat for the user to put in the PR description, OR
- Pick the most representative line and anchor there, but write the comment focused on that line's symptom — not on the broader finding.

## API gotchas

- **422 "line must be part of the diff"** → the chosen line wasn't touched by the PR. GitHub allows comments on context lines only if the file is in the diff AND the line is within an existing hunk. Fallback: comment on the nearest hunk line and mention the real target line in the body.
- **422 "commit_id is not the head"** → PR was force-pushed mid-review. Re-fetch `headRefOid` and retry.
- **404 on path** → `path` must match the PR file path exactly (case-sensitive, repo-relative, no leading `/`).
- **Multi-line comments require both `start_line` AND `line`** on the same side; mixing LEFT/RIGHT will be rejected.

## Default selection policy

| Severity | Default action |
|---|---|
| Critical | **Default-selected.** Post inline as `[Must fix]` on its most representative line. A finding with no sensible anchor (a migration risk, an ops step) goes into the review `body` after the counts, still labelled `[Must fix]`. |
| Important | **Default-selected.** Post inline as `[Must fix]`. |
| Nice-to-have | **Default-selected.** Post inline as `[Optional]`. |

Every bucket is posted so the PR author sees the whole review in one place; the label tells them what blocks the merge. The user may still deselect items in step 2.

## Single batched review, not N individual comments

Always use `POST /pulls/N/reviews` with a `comments` array — never loop over `POST /pulls/N/comments`. Reasons:
1. One review summary + N comments groups in the GitHub UI; individual comments scatter.
2. One API call vs N — rate-limit and webhook friendly.
3. Atomic: either all comments post or none.

## Idempotency

GitHub does NOT de-duplicate review comments. Re-running this skill against the same findings creates duplicates. Before posting, scan **your own** existing comments:

```bash
ME=$(gh api user --jq .login)
gh api "repos/$REPO/pulls/$PR_NUMBER/comments" --paginate \
  | jq -r --arg me "$ME" '.[] | select(.user.login == $me) | .path + ":" + (.line // .original_line | tostring) + " — " + (.body | split("\n")[0])'
```

**Scope the scan to `$ME` — never to all authors.** A teammate (or another agent account) running the same review converges on the same `path:line` with near-identical wording; counting their comment as yours silently drops your finding, and a caller that then reports "check my comments" points at a comment you never wrote.

If any line of the planned post matches one of YOUR existing comments' `path:line` AND that comment's first ~60 chars overlap significantly with the planned body (substring or high token-overlap), warn the user and skip. Compare the text after the `[Must fix]` / `[Optional]` label — every comment starts with one, so the label alone says nothing about overlap. An existing comment of yours without a label (posted before labels existed) still counts as a duplicate.

## Example end-to-end

```
User:  /rk:code-review #12
       ... review surfaces C1/C2/C3 (Critical), I1–I6 (Important), N1–N7 (Nice).
User:  comment the findings to the PR
Claude:
  1. Resolves PR #12 → Everfit-io/challenger-service, HEAD 032b86d.
  2. AskUserQuestion: all 16 selected; user deselects N6, N7.
  3. Writes /tmp/pr-12-review.json: C1–C3 + I1–I6 as [Must fix], N1–N5 as [Optional];
     body "9 must fix, 5 optional.".
  4. POST /repos/Everfit-io/challenger-service/pulls/12/reviews.
  5. Returns review URL: https://github.com/Everfit-io/challenger-service/pull/12#pullrequestreview-XXX
  6. Replies with a table: ID | label | file | lines | one-line title.
```

## STOP rules

- ✗ No findings in context AND user didn't paste any → don't invent — tell them to run `/rk:code-review` first.
- ✗ Don't post a comment without its `[Must fix]` / `[Optional]` label, or with the wrong one (Critical/Important = Must fix, Nice-to-have = Optional).
- ✗ Don't loop `POST /comments` — always batch via `POST /reviews`.
- ✗ Don't use `gh pr review --comment` for inline anchoring — its `--body` is a single PR-level comment, no `path/line`. Use `gh api` with the JSON payload.
- ✗ Don't `--event=REQUEST_CHANGES` or `APPROVE` — this skill is for COMMENT-only reviews. Approval/rejection is a separate decision.
- ✗ Don't post the comment body in Vietnamese unless the repo's existing reviews are in Vietnamese. Match the repo's review language.
- ✗ Don't include any tool/skill/agent/finding-ID marker in the comment body — see "Comment voice". The PR teammates should read these as if a human wrote them.
- ✗ Don't write severity any other way (`**Important**`, `**Critical**`, `nit:`) — the label is the only marker.

## Output to the user

After posting, reply with:
1. The review URL (clickable).
2. A compact table: `ID | label | path:lines | title` for each posted comment.
3. A note on any finding NOT posted (deselected, duplicate, no anchor) and why.
