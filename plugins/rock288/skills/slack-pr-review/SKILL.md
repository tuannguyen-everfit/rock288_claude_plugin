---
name: rk:slack-pr-review
description: "Review a PR linked inside a Slack message, then act on the result end-to-end. Given a Slack message URL (whose text contains a GitHub PR link), run rk:code-review on that PR; if it surfaces Critical/Important findings, post them inline via rk:pr-comment and reply in the Slack thread '<@author> Please check my comments'; otherwise comment 'LGTM!' on the PR and reply '<@author> approved'. Fully automatic — no confirmation gate. Triggers on: 'review pr from slack', 'review slack pr link', 'check pr in this slack message', 'review code từ link slack'."
argument-hint: "[<slack-message-url>] [--pr=<#N|url>] [--dry-run]"
metadata:
  author: rock288
  version: "1.0.0"
---

# Slack → PR Review

Take a **Slack message URL** whose text contains a **GitHub PR link**, review that PR with
[`rk:code-review`](../code-review/SKILL.md), and route the outcome automatically:

- **Has blocking findings** (Critical or Important) → post them inline with
  [`rk:pr-comment`](../pr-comment/SKILL.md), then reply in the Slack thread:
  `<@author> Please check my comments`
- **Clean / only Nice-to-have** → comment `LGTM!` on the PR, then reply in the thread:
  `<@author> approved`

`<@author>` = the author of the Slack message you were given (the person who shared the PR),
tagged as a real Slack mention.

**IMPORTANT:** This skill posts to GitHub and Slack **without a confirmation gate** (fully
automatic by design). Use `--dry-run` to preview the plan without posting.
This skill never edits code — it only reviews, comments, and replies.

## Flags

| Flag | Default | Effect |
|---|---|---|
| `<slack-message-url>` (positional) | — | The Slack message URL that contains the PR link. **Required.** Channel + message ts parsed from it; the message author is the one tagged in the reply. |
| `--pr=<#N\|url>` | auto | Force the PR target instead of extracting it from the Slack message text (use when the message has no parseable PR link). |
| `--dry-run` | off | Run the review and print exactly what *would* be posted (PR comment(s) + Slack reply), but post nothing. |

## Severity routing (authoritative)

`rk:code-review` buckets findings as **Critical / Important / Nice-to-have**.

| Review result | Branch | PR action | Slack reply |
|---|---|---|---|
| Any **Critical** or **Important** finding | **Needs fix** | Post Critical + Important inline via `rk:pr-comment` (`--severity=critical,important`) | `<@author> Please check my comments` |
| Only **Nice-to-have**, or no findings | **LGTM** | `gh pr comment <PR> --body "LGTM!"` | `<@author> approved` |

Nice-to-have findings are always ignored for routing and never posted inline.

## Workflow

### 1. Parse the Slack message URL

Same parsing as [`ef-daily-report`](../ef-daily-report/SKILL.md) §5:
- `https://<workspace>.slack.com/archives/<CHANNEL_ID>/p<DIGITS>` →
  `channel_id = <CHANNEL_ID>`; `ts` = insert a dot 6 digits from the end of `<DIGITS>` (drop the
  leading `p`), e.g. `p1727890123456789` → `1727890123.456789`.
- If the URL has a query `?thread_ts=<ts>&cid=<CHANNEL_ID>`, prefer `thread_ts` + `cid`.

The parsed `ts` is BOTH the message to read AND the `thread_ts` to reply under.

### 2. Read the message → author + PR link

Read the target message (backend selection mirrors §6):
- **Preferred** (if registered): `mcp__slack-mcp__conversations_replies` with `channel_id` and
  the parsed `ts` (the parent message is the first entry returned).
- **Fallback**: `mcp__claude_ai_Slack__slack_read_thread` with `channel_id` + `thread_ts`.

From the parent message:
- `author_id` = the message's `user` field. The Slack mention is `<@author_id>` — no
  display-name lookup needed; Slack renders the mention from the ID.
- `text` = the message body. Extract the PR URL with:
  `https://github\.com/[^/\s]+/[^/\s]+/pull/\d+`
  Take the first match. If multiple distinct PRs are linked, ask the user which one (this is the
  only interactive stop in the flow).

If no PR link is found and `--pr` was not passed → **STOP**: tell the user the message has no
GitHub PR link and ask for `--pr=`.

### 3. Review the PR

Invoke [`rk:code-review`](../code-review/SKILL.md) in **PR mode** with the resolved PR
(`#N` or URL). Let it run its full adversarial pipeline. Collect the findings with their
severities + `file:line` anchors so step 5 (`rk:pr-comment`) has them in context.

### 4. Decide the branch

`needs_fix = (count(Critical) + count(Important)) > 0`.

- `needs_fix == true` → go to **5a**.
- else → go to **5b**.

`--dry-run`: skip 5a/5b posting; instead print the chosen branch, the exact PR comment(s) that
would post, and the exact Slack reply text. Stop.

### 5a. Branch: needs fix

1. Post the Critical + Important findings inline by invoking
   [`rk:pr-comment`](../pr-comment/SKILL.md) with `--severity=critical,important` so it runs
   **non-interactively** (that flag skips its multi-select prompt and posts all matching
   findings). The findings from step 3 are already in context, which is `pr-comment`'s
   precondition. Comment voice rules from `pr-comment` apply — comments must read as if a human
   wrote them.
2. Reply into the Slack thread (see §6) with exactly:
   `<@author_id> Please check my comments`

### 5b. Branch: LGTM

1. Post a top-level approval comment on the PR:
   ```bash
   REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)   # or owner/repo parsed from the PR URL
   gh pr comment <PR_NUMBER> --repo "$REPO" --body "LGTM!"
   ```
   (Top-level comment, not an inline review — there's nothing to anchor.)
2. Reply into the Slack thread (see §6) with exactly:
   `<@author_id> approved`

### 6. Reply into the Slack thread

Mirror [`ef-daily-report`](../ef-daily-report/SKILL.md) §5 / `ef-ship` §10 backend selection, always passing
`thread_ts` = the parsed `ts` from step 1 so the reply lands **in the thread**:
- **Preferred** (if registered): `mcp__slack-mcp__conversations_add_message` with `channel_id`,
  `thread_ts`, `text` = the reply, `content_type` = `text/markdown`.
- **Fallback** (default bundled): `mcp__claude_ai_Slack__slack_send_message` with `channel_id`,
  `thread_ts`, `message` = the reply.

On post failure, surface the error but don't crash — print the reply text so the user can paste
it manually.

## Output to the user

Report compactly:
1. Resolved Slack message → `channel_id`, `thread_ts`, author `<@id>`.
2. Resolved PR → `REPO#N`.
3. Review verdict → counts: `Critical=X, Important=Y, Nice-to-have=Z` → branch taken.
4. What was posted: PR review URL (5a) or `LGTM!` comment URL (5b), and the Slack reply `ts`.

## Edge cases & safety

- **Not a channel member** → `conversations_replies`/post may fail. Try
  `mcp__slack-mcp__conversations_join` (preferred backend only) or fall back to the
  `claude_ai_Slack` backend; if still blocked, print the reply for manual paste.
- **PR already reviewed** → `pr-comment` handles idempotency (scans **your own** existing comments,
  skips near-duplicates). Don't re-post `LGTM!` if an identical recent comment by you already exists —
  check with `gh pr view <N> --json comments`.
- **Review is inconclusive / errors** → do NOT guess a branch. Surface the failure, post
  nothing, and let the user decide.
- **Reply strings are fixed by spec**: `Please check my comments` and `approved` are literal —
  do not translate or rephrase them.
- **`--dry-run` writes nothing** to GitHub or Slack.

## STOP rules

- ✗ No PR link in the message AND no `--pr=` → stop, ask for the PR.
- ✗ Don't edit code or push commits — review + comment + reply only.
- ✗ Don't post Nice-to-have findings inline; they never affect routing.
- ✗ Don't change the two literal reply strings.
- ✗ Don't open a new top-level Slack message — always reply under the given message's thread.
