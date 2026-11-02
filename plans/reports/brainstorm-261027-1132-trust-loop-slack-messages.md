# Brainstorm: trust-loop Slack messages — shorter, cleaner

Date: 2026-10-27 · Status: design approved · Skill: `plugins/rock288/skills/trust-loop`

## Problem
trust-loop posted 4 messages in the CHAL-864 thread (#backend-review-code, PR #20398): parent, Evidence, Round 1, Merged. User: too long, ugly.

Root cause: `SKILL.md` §7.2 has no Slack template ("the channel and reviewers the human names"), so the agent improvises.

Observed defects:
- Markdown table in Evidence → Slack mrkdwn does not render tables → raw `| --- |` pipes.
- Receipt hashes (5× in Evidence, 7× in Merged) = local `.git` fingerprints, unverifiable by reviewers → noise.
- Runtime / Not verified / Review attention as prose paragraphs, duplicating the PR body.
- Round reply: 7 optional items as full sentences, no visual fixed vs kept distinction.

## Approaches evaluated
| Approach | Pros | Cons |
|---|---|---|
| **A. Slack short, detail in PR** (chosen) | ~70% shorter, no duplication, PR already renders table | per-test detail needs a click |
| B. Keep detail, table → code block | detail in Slack | ~15 lines, wraps on mobile, duplicates PR |
| C. Merge into parent, no reply | fewest notifications | no evidence anchor, heavier parent |

Language: English (matches commit/PR/Jira; copy from PR body). Rejected: VN, auto-detect.

## Final design
New file `references/slack-messages.md`; §7.2 in `SKILL.md` points to it. Patch bump `4.6.0 → 4.6.1` in `plugin.json` + `marketplace.json`. Skill `metadata.version` 1.0.0 → 1.1.0. No script changes.

### Global rules
- Slack mrkdwn only: `*bold*`, `•`, `` `code` ``, `<url|text>`. No markdown tables, `**`, `##`.
- No receipt hashes, no local paths. Gates by name.
- One item per line, ≤~100 chars. Longer → PR.
- Emoji legend: ✅ done/pass · ⚠️ not verified/risk · 👀 reviewer attention · ⏭️ kept (with reason) · ⏳ open · 🚀 merged.
- Line caps: parent ≤5 · evidence ≤6 · round ≤8 · merged ≤3.
- 👀 line mandatory in Evidence when behavior changes for existing callers.
- "Sent using Claude" footer added by the Slack tool — not in template.

### Templates (filled with the CHAL-864 example)
1. Parent
```
@be-team @Quang review: feat(profile, auth): CHAL-864 · <PR #20398>
New Core profile no longer copies WL data on a Challenger account;
/enroll into a regular team refuses an existing email.
Evidence in thread 🧵
```
2. Evidence (thread reply)
```
*Evidence* · CHAL-864 · <PR #20398>
✅ Red/green: 5 new tests fail on old code → pass on new
✅ Gates: guardrails · lint · unit (664) · smoke
⚠️ Not on dev: no Challenger+WL fixture, no referral code
👀 /enroll (regular team) now refuses an existing email; WL still links
→ Per-test table in the PR description
```
3. Round N
```
*Round 1* · Robin's review
✅ Must fix: auth fallback skips every everfit/challenger profile `0bb7b71`
✅ Stale comment client-enroll:135 `7692f84`
⏭️ account_id guard: all 8 callers pass it
⏭️ isEmailTaken 409 on DB error: same rule as check-exist (intended)
⏳ WL exception in AC + /enroll callers: confirming with app/web
Review re-requested
```
4. Merged
```
🚀 Merged `62d48a5` · approved by huyeverfit, quangphamminh
Follow-up: extra auth call on new sign-ups · watching dev deploy
```

## Risks
- Shorter message drops something reviewer needs → mitigated: mandatory 👀 line + full red/green table in PR body (§7.1 already requires it).
- Round with >6 items exceeds cap → group extra ⏭️ items: "⏭️ 3 more kept — reasons on the PR".

## Success criteria
- Next trust-loop run: no `|---|` or hash in Slack; each message within line cap.
- Reviewer gets verdict-level info without opening the PR; per-test detail only in PR.

## Next steps
1. Write `references/slack-messages.md` (rules + 4 templates).
2. Edit §7.2 (+ §7.4 report stays chat-only) in `SKILL.md`.
3. Bump versions, commit, push, refresh plugin.

## Unresolved questions
- None.
