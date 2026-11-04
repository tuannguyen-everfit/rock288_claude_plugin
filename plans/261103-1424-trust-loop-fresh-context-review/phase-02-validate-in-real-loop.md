# Phase 2 — Validate in a real loop

**Status:** pending · **Needs:** phase 1 committed + pushed, `claude plugin marketplace update rk-kit && claude plugin update rk@rk-kit`, restart.

Combined with phase 2 of `261102-0005-trust-loop-effort-split` (effort check): one real loop covers both.

## Run
`/rk:trust-loop <small real task with ≥1 likely must-fix>` in a consumer repo (e.g. challenger-service).

## Check in the transcript
- [ ] Round 1: one message with 2 `rk:code-reviewer` spawns, both `effort: "high"`
- [ ] Round 2 prompts are byte-identical to round 1 (diff the two Agent inputs)
- [ ] `rk-trust/review-brief.md` + `review-rounds.md` exist in the git dir; `git status` is clean of them; `verify-change --status` stays ok after the brief is written
- [ ] Writing the brief / round log with Bash into the git dir does not raise a permission prompt in bypass mode (reported for Write/Edit on `.git/` since Claude Code 2.1.78, unverified)
- [ ] Re-entry on the same branch (resume or a pr-follow-up fix) keeps the brief and the round log
- [ ] Main never drops a `[Must fix]`; a dispute (force one if needed) gets UPHELD/WITHDRAWN from the next round
- [ ] Main session (medium) and reviewers (high) show the effort split (from plan 261102-0005)
- [ ] Rounds-to-clean compared with the old flow: findings round 2+ should not be "only the fixed lines"

## On failure
- `effort` ignored → note it, fall back to agent frontmatter `effort: high` for `code-reviewer` (needs the human's OK: that affects every caller)
- Reviewer prompt picks up session text → tighten the "fill placeholders only" line in step 5
