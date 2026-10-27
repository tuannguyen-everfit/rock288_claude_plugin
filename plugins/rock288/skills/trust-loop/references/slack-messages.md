# Slack messages

Templates for every message the loop posts to a review thread. Slack carries the verdict; the PR carries the detail (red/green table, tier list, runtime output). A reviewer should decide whether to open the PR from Slack alone.

## Rules
- **Standard markdown**, which the Slack tool converts: `**bold**`, `` `code` ``, `[text](url)`. Single `*x*` renders italic. No tables (they render, but run long and wrap on mobile; the table lives in the PR), no `#` headings.
- **No receipt hashes, no local paths.** Receipts live under the author's git dir; a reviewer cannot open them. Name the gates instead.
- One item per line, ~100 chars max. Anything longer belongs in the PR.
- Line caps: parent ≤ 5 · evidence ≤ 6 · round ≤ 8 · merged ≤ 3. Over the cap → group the tail: `⏭️ 3 more kept, reasons on the PR`.
- Emoji, fixed meaning:

  | Emoji | Means |
  |---|---|
  | ✅ | done / passing |
  | ⚠️ | not verified / risk |
  | 👀 | reviewer should look at this |
  | ⏭️ | kept as is (with a reason) |
  | ⏳ | still open (with an owner) |
  | 🚀 | merged |

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
**Evidence** · <CARD> · [PR #<n>](<PR url>)
✅ Red/green: <N> new tests fail on old code → pass on new
✅ Gates: <tier names from the receipt> (<unit count if known>)
⚠️ Not verified: <what, why — one line>
👀 <behavior change existing callers will notice>
→ Per-test table in the PR description
```
- 👀 is required when existing callers see different behavior; drop it otherwise.
- ⚠️ drops only when everything was exercised at runtime.
- A tier that was red on the base and fixed in this change: `✅ Gates: … (fixed a red <tier> on <base>)`.
- Failures the baseline already showed, unchanged by this change: ✅, not ⚠️ — `✅ e2e: no new failures (5 already red on develop)`. ⚠️ is for what this change could not prove.
- Something the change needs that is outside the PR (infra, config, another team's deploy): ⏳ with who and before what — `⏳ MSK topic on dev/stg/prd: needs a DevOps request before CHAL-863 deploys`.

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
🚀 Merged `<sha>` · approved by <logins>
<follow-ups, or "no follow-ups"> · <deploy status>
```

## Example (CHAL-864)
```
@be-team @Quang review: feat(profile, auth): CHAL-864 · [PR #20398](<url>)
New Core profile no longer copies WL data on a Challenger account;
/enroll into a regular team refuses an existing email.
Evidence in thread 🧵
```
```
**Evidence** · CHAL-864 · [PR #20398](<url>)
✅ Red/green: 5 new tests fail on old code → pass on new
✅ Gates: guardrails · lint · unit (664) · smoke
⚠️ Not on dev: no Challenger+WL fixture, no referral code
👀 /enroll (regular team) now refuses an existing email; WL still links
→ Per-test table in the PR description
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
🚀 Merged `62d48a5` · approved by huyeverfit, quangphamminh
Follow-up: extra auth call on new sign-ups · watching dev deploy
```
