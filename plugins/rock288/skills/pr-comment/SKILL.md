---
name: rk:pr-comment
description: "Post selected findings from /rk:code-review as inline PR review comments anchored to exact file:line locations. Use AFTER a code review when the user wants the Important (or chosen) items pushed to GitHub as inline comments. Triggers on: comment to pr, post review inline, push findings to pr, drop comments on pr."
argument-hint: "[#PR | PR-URL] [--severity=important,critical,niceto]"
metadata:
  author: rock288
  version: "1.0.0"
---

# PR Inline Comment

Convert review findings into GitHub inline PR review comments anchored to the exact `file:line` where the issue lives. Default selection is **Important**; user picks the rest.

## When to use

- Right after `/rk:code-review` finished and findings are in the conversation context.
- User says: *"comment the Important items into the PR"*, *"post the review inline"*, *"drop comments on PR #N"*, Vietnamese variants (*"comment code cho pr"*, *"đẩy review vào PR"*).
- **NOT for:** top-level PR summary comments (use `gh pr comment`), code edits, or creating GitHub issues.

## Inputs

| Arg | Meaning |
|---|---|
| `#NNN` or `https://github.com/.../pull/NNN[/...]` | PR number — required if branch is not linked to a PR |
| `--severity=critical,important,niceto` | Pre-select severity buckets (default: `important`) |
| *(no args)* | Resolve PR from current branch; default to Important |

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

Use `AskUserQuestion` with `multiSelect: true`. Header: `Post findings`. Default-check all Important; offer Critical and Nice-to-have as opt-ins. Cap at 8 options per question — chunk if more.

```
question: "Which findings to post inline on PR #N?"
options:
  - label: "I1 — Duplicated godoc on Status"
    description: "service.go:43-48 (Important)"
  - label: "I2 — Validator accepts states the filter rejects"
    description: "handler.go:45 (Important)"
  ...
```

If `--severity=...` is passed, skip the prompt and select all matching findings.

### 3. Build the review payload

Write to a temp file (`/tmp/pr-{N}-review.json`) — avoids shell-escaping markdown bodies.

```json
{
  "commit_id": "<HEAD_SHA>",
  "event": "COMMENT",
  "body": "",
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

## Comment voice — write like a human reviewer

The body that lands on the PR must look like a real human teammate wrote it. Reviewers reading the PR shouldn't be able to tell it came from a tool. **Hard rules:**

- ❌ **Never mention skill, agent, command, or tool names.** No `/rk:code-review`, `/rk:`, `claude`, `code-reviewer`, `subagent`, etc.
- ❌ **No internal finding IDs.** No `I1`, `C2`, `N3`, `Finding 4`, "from the review", "per the audit", etc.
- ❌ **No severity prefixes.** Don't lead with `**Important**`, `**Critical** —`, etc. The reviewer's tone conveys severity.
- ❌ **No "the review surfaced…", "I noticed during review…", "automated check found…"** framing.
- ❌ **No top-level review `body` field with a tool summary.** Leave it empty (`""`) or a short neutral sentence (e.g. `"A few thoughts."`).
- ✅ **Lead with the observation.** What's wrong, in one sentence. Then evidence, then the suggested fix.
- ✅ **Cite repo rules / RFCs / standards by their own name**, not by who flagged it. e.g. *"`.claude/rules/mongo.md` §6 forbids this — fix the struct tag instead."*
- ✅ **Code blocks for the suggested fix** when it's short.
- ✅ **Match the repo's review language** (English unless the repo's history is otherwise).
- ✅ **Be direct, concise, technical.** No hedging ("might want to consider"). No performative niceness ("Great work! One small nit:"). Land the point.

### Body length

- Single-line nit (typo, duplicated line): **1 sentence**.
- Behavior bug / API mismatch: **2–4 sentences + optional code block**.
- Design-level (semantics, contract): **a short paragraph + the choice list** (pick one of: …). Cap ~150 words.

### Good vs. bad — paired examples

**Bad (skill-leak + ID + severity prefix):**
> **I1 — Duplicated godoc on Status** (Important)
>
> Per `/rk:code-review`: this 3-line block is duplicated. Fix.

**Good:**
> This doc comment is duplicated — the same three lines appear at 43–45 and 46–48. Drop one block.

**Bad:**
> **I3 — Violates `.claude/rules/mongo.md` §6 STOP rule.** (Important — from automated review)
>
> The /rk:code-review skill flagged this delete() workaround.

**Good:**
> `omitempty` is already on `_id` and `created_at` (`service.go:87, :109`) — the `delete()` calls are only needed because `buildSeeds()` assigns a non-zero `ID: seedID` and `CreatedAt: now`. Cleaner: keep `seedID` as a local for the filter, leave `ch.ID` zero, drop `CreatedAt` from the struct literal. `$setOnInsert` already owns it. `.claude/rules/mongo.md` §6 has the rationale.

**Bad:**
> **I6 (Important):** `days_left` undefined for `coming_soon`. The Stage-3 adversarial pass caught this.

**Good:**
> For a challenge with `starts_at > now`, this still returns `{kind: "days_left", days: N}` — counting down to `ends_at` before the challenge has started. Lifecycle was moved client-side per the `Status` doc; the server probably shouldn't ship `days_left` at all, or should return `coming_soon` when `now < starts_at`. Worth picking one.

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
| Critical | Skip — surface in chat / top-level PR comment instead (these usually need a PR-description update, not a code-line anchor) |
| Important | **Default-selected.** Post inline. |
| Nice-to-have | Opt-in only. Encourage the user to cherry-pick 1–3 high-signal items rather than all. |

Why Critical is opt-out by default: critical findings (wire-contract breaks, migration risks, ops steps) usually don't have a single "fix this line" answer — they need a checklist in the PR body. Posting them as line comments fragments the discussion. If the user asks to include them, do it; otherwise summarize in the chat reply.

## Single batched review, not N individual comments

Always use `POST /pulls/N/reviews` with a `comments` array — never loop over `POST /pulls/N/comments`. Reasons:
1. One review summary + N comments groups in the GitHub UI; individual comments scatter.
2. One API call vs N — rate-limit and webhook friendly.
3. Atomic: either all comments post or none.

## Idempotency

GitHub does NOT de-duplicate review comments. Re-running this skill against the same findings creates duplicates. Before posting, scan existing reviews:

```bash
gh api "repos/$REPO/pulls/$PR_NUMBER/comments" --paginate \
  | jq -r '.[] | .path + ":" + (.line // .original_line | tostring) + " — " + (.body | split("\n")[0])'
```

If any line of the planned post matches an existing comment's `path:line` AND the existing comment's first ~60 chars overlap significantly with the planned body (substring or high token-overlap), warn the user and skip. Don't rely on tool-marker prefixes — there aren't any (see "Comment voice").

## Example end-to-end

```
User:  /rk:code-review #12
       ... review surfaces C1/C2/C3 (Critical), I1–I6 (Important), N1–N7 (Nice).
User:  comment the Important ones to the PR
Claude:
  1. Resolves PR #12 → Everfit-io/challenger-service, HEAD 032b86d.
  2. AskUserQuestion: confirms I1–I6 selected, C/N opt-out.
  3. Writes /tmp/pr-12-review.json with 6 comments (mixed single + multi-line).
  4. POST /repos/Everfit-io/challenger-service/pulls/12/reviews.
  5. Returns review URL: https://github.com/Everfit-io/challenger-service/pull/12#pullrequestreview-XXX
  6. Replies with a table: ID | file | lines | one-line title.
```

## STOP rules

- ✗ No findings in context AND user didn't paste any → don't invent — tell them to run `/rk:code-review` first.
- ✗ Don't post Critical-tier findings inline unless the user explicitly opts in (see policy table).
- ✗ Don't loop `POST /comments` — always batch via `POST /reviews`.
- ✗ Don't use `gh pr review --comment` for inline anchoring — its `--body` is a single PR-level comment, no `path/line`. Use `gh api` with the JSON payload.
- ✗ Don't `--event=REQUEST_CHANGES` or `APPROVE` — this skill is for COMMENT-only reviews. Approval/rejection is a separate decision.
- ✗ Don't post the comment body in Vietnamese unless the repo's existing reviews are in Vietnamese. Match the repo's review language.
- ✗ Don't include any tool/skill/agent/finding-ID marker in the comment body — see "Comment voice". The PR teammates should read these as if a human wrote them.
- ✗ Don't lead with severity (`**Important**`, `**Critical**`) — let the tone convey weight.

## Output to the user

After posting, reply with:
1. The review URL (clickable).
2. A compact table: `ID | path:lines | title` for each posted comment.
3. A note on which severity buckets were SKIPPED and why (so the user knows what's still pending).
