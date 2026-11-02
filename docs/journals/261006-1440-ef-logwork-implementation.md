# 2026-10-06 — ef-logwork: implement + ship rk 4.3.0

**Context:** [Predecessor: 261006-1357 brainstorm & plan](./261006-1357-ef-logwork-brainstorm-plan.md)

**Shipped:** `/rk:ef-logwork` skill in commit `82f8fde` (rk 4.3.0) + CLAUDE.md doc fix `565fb6d`. Plugin refresh `4.2.2 → 4.3.0` required; restart Claude Code to load.

## What Went Right

- **30 unit + CLI tests**, all green. Real run end-to-end: ~3.5s.
- Code review 7.5 → 9 → 9.5 (7 Important + 16 minors fixed). Re-review after fixes + final integration pass confirmed zero Critical/Important. No shell injection; Jira writes behind draft→confirm; `--audit` read-only.
- Tester: 0 bugs on real 5h45m worklogs (5 entries, 2026-10-06).

## Five Lessons That Hurt

**1. Jira JQL tokenization is a footgun.** `Platform&Capability` is one token. The plan's `summary ~ "Platform"` → 0 rows. Fixed: `summary ~ "General Task"` + client-side prefix/squad filter. **Always verify JQL live** before trusting a plan in production.

**2. Atlassian MCP `responseFields` trap.** Paths are relative to `data`; a `data.` prefix returns `{"data":{}}`, indistinguishable from "no worklogs". Silent data loss. Would have hidden 3 of my 5 worklogs. The ledger doc now documents this. **Test responseFields with live queries.**

**3. `git log --source` on fork points propagates the wrong card.** `--all --source` newest-first walk labels card-less mainline commits below a fork with a feature branch's card. Fixed: `--first-parent` for mainline-only set (develop/main/master), ignore `%S` for commits in that set. Stacked branches still leaked; fixed by bucketing `commits[]` per card and prioritizing subject commits. First regression fixture didn't reproduce—mutation-check caught the vacuous test. **Mainline attribution is fragile; test fork-point scenarios.**

**4. Jira `key in (…)` JQL tolerates unknown keys.** They are simply absent, not errors—contrary to the reviewer's assumption. Verified live. **Challenge assumptions against the actual MCP.**

**5. Worklog timezone is absolute, not wall-clock.** Jira `started` comes in account tz (-0700, LA). Bucketing by VN day requires absolute instants. Fixed: always send `started: "<date>T09:00:00.000+0700"`. Separately, change Jira profile tz to VN. **Timestamps are the hardest-earned bug.**

## Other Deviations Accepted

- `scan_skills.py` hardcodes `.claude/skills` → needs scratch dir symlink (now in CLAUDE.md). `ef-daily-report/memory/` is gitignored, so "sibling precedent" assumption was inaccurate. Shipped anyway (no personal identifiers in logwork.md).
- `--yes` only auto-confirms zero-warning drafts; `--dry-run` beats `--yes`.
- Config saved under `--shared` detect, also steps 1–2 save on defaults or sprint-change; banner clarified.

## Next (Manual, Blocking Restart)

1. `claude plugin marketplace update rk-kit && claude plugin update rk@rk-kit` → restart Claude Code → confirm `/rk:ef-logwork` appears in skill list.
2. Real 15m test on UP-80126 (shared card, verified in config).
3. `--audit` cross-check vs PC dashboard (expect ≤15m/day gap if any).
