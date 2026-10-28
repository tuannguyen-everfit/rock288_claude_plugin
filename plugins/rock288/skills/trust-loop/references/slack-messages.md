# Slack messages

Templates for every message the loop posts to a review thread. Slack carries the verdict; the PR carries the detail (red/green table, tier list, runtime output). A reviewer should decide whether to open the PR from Slack alone.

## Rules
- **Standard markdown**, which the Slack tool converts: `**bold**`, `` `code` ``, `[text](url)`. Single `*x*` renders italic. No tables (they render, but run long and wrap on mobile; the table lives in the PR), no `#` headings.
- **No receipt hashes, no local paths.** Receipts live under the author's git dir; a reviewer cannot open them. Name the gates instead.
- One item per line, ~100 chars max. Anything longer belongs in the PR.
- Line caps: parent ≤ 5 · evidence = 3 · round ≤ 8 · merged = 1 · deployed = 1. Over the cap → group the tail: `⏭️ 3 more kept, reasons on the PR`.
- Emoji, fixed meaning:

  | Emoji | Means |
  |---|---|
  | ✅ | done / passing |
  | ⚠️ | not verified / risk |
  | 👀 | reviewer should look at this |
  | ⏭️ | kept as is (with a reason) |
  | ⏳ | still open (with an owner) |
  | 🚀 | merged |
  | ❌ | deploy failed / blocked |

- English, same wording as the commit / PR. Short commit SHAs (7 chars) in backticks.
- The Slack tool appends its own "Sent using" footer; do not add one.

## 1. Review request (parent)
```
<@group> <@reviewer> review: <commit subject> · [PR #<n>](<PR url>)
<1–2 lines: the behavior change as a user or caller sees it>
Evidence in thread 🧵
```

## 2. Evidence (thread reply)
```
**Evidence** · <CARD> · [PR #<n>](<PR url>) · per-test table in the PR
✅ <N> tests red on old → green on new · gates: <tier names from the receipt>
<the one thing the reviewer must know: 👀 | ⏳ | ⚠️>
```
- Exactly 3 lines. Everything else (more risks, baseline failures, unit counts) goes in the PR description.
- Line 3 takes the first that applies, the rest go in the PR:
  1. 👀 behavior existing callers will notice.
  2. ⏳ something outside the PR the change needs, with who and before what — `⏳ MSK topic on dev/stg/prd: DevOps request before deploy`.
  3. ⚠️ what this change could not prove — `⚠️ Not on dev: no Challenger+WL fixture`.
  4. Nothing to flag → `✅ Runtime: <what was exercised>`.
- A tier red on the base and fixed here, or failures the base already had: a short tail on line 2 when it fits (`· fixed red e2e`, `· e2e: 5 red on develop, none new`); otherwise the PR.

## 3. Review round (thread reply)
```
**Round <n>** · <reviewer>'s review
✅ Must fix: <what changed> `<sha>`
✅ <optional item fixed> `<sha>`
⏭️ <optional item kept>: <reason in a few words>
⏳ <open item>: <who is confirming>
Review re-requested
```
- Must-fix lines first, then fixed optionals, then kept, then open.
- Full answers to each comment go on the PR, not here.

## 4. Merged (thread reply)
```
🚀 Merged `<merge sha>`
```
- One line, nothing else: approvers, follow-ups and open threads stay on the PR.

## 5. Deployed (thread reply, from `/rk:pr-follow-up`)
```
✅ Deployed to dev · `<merge sha>`
```
- One line, nothing else: deploy time, dev check result and the Jira move go in the Jira comment.
- Deploy failed or timed out: `❌ Dev deploy <failed | not seen within 90 min>: <pipeline> · <@author>` instead.

## Example (CHAL-864)
```
@be-team @Quang review: feat(profile, auth): CHAL-864 · [PR #20398](<url>)
New Core profile no longer copies WL data on a Challenger account;
/enroll into a regular team refuses an existing email.
Evidence in thread 🧵
```
```
**Evidence** · CHAL-864 · [PR #20398](<url>) · per-test table in the PR
✅ 5 tests red on old → green on new · gates: guardrails · lint · unit · smoke
👀 /enroll (regular team) now refuses an existing email; WL still links
```
```
**Round 1** · Robin's review
✅ Must fix: auth fallback skips every everfit/challenger profile `0bb7b71`
✅ Stale comment client-enroll:135 `7692f84`
⏭️ account_id guard: all 8 callers pass it
⏭️ isEmailTaken 409 on DB error: same rule as check-exist (intended)
⏳ WL exception in AC + /enroll callers: confirming with app/web
Review re-requested
```
```
🚀 Merged `62d48a5`
```
```
✅ Deployed to dev · `62d48a5`
```
