---
phase: 1
title: "Git activity collector script"
status: completed
effort: 2.5h
---

# Phase 1 — Git activity collector script

## Context Links
- [plan.md](./plan.md) · [brainstorm](../reports/brainstorm-261006-1357-ef-logwork-skill.md)
- Harness precedent: `plugins/rock288/skills/worktree/scripts/worktree.cjs` + `worktree.test.cjs`

## Overview
Priority P1 (blocks Phase 2). Deterministic Node script: "what did I touch on VN day X" → JSON the skill turns into suggested worklog entries. Covers git commits AND PR reviews.

## Key Insights
- `git log --since/--until` filters on **committer** date; rebase/amend rewrites it → widen window (`date-1 … date+2`) then bucket on **author** date (`%aI`) converted to +07:00. Same widened→precise pattern as `ef-daily-report/references/derivation.md`.
- Card IDs live in subjects (`fix(truecoach): UP-79399 …`) and branches (`dev_s18_26.feat/CHAL-399`). Projects vary (`UP`, `CHAL`) → regex `\b([A-Z][A-Z0-9]+-\d+)\b`.
- `gh search prs --reviewed-by=@me --updated=…` returns PRs *touched* in the window, not *reviewed* → must read `gh api repos/{owner}/{repo}/pulls/{n}/reviews` and keep reviews with `user.login == me` and `submitted_at` in VN day.
- Squash-merged subjects end with `(#123)` → outcome hint `PR #123 merged`.
- Forked repos (everfit-api ↔ metric-service) duplicate subjects → dedupe subjects per card.

## Requirements
- Functional: CLI below; JSON on stdout; never throws on one bad repo (collect into `errors[]`).
- Non-functional: <5s for ~25 repos; `execFileSync` only (no shell string interpolation); zero npm deps.

## Architecture

```
node git-activity.cjs --date=YYYY-MM-DD [--tz=+07:00] [--roots=~/Source,~/tuan]
                      [--author=<email>] [--no-reviews] [--gh-login=<login>]
```
Defaults: `--date` = today in `--tz`; `--roots` = `~/Source`; `--author` = per-repo `git config user.email`; reviews ON.

Output:
```json
{
  "date": "2026-10-06", "tz": "+07:00",
  "cards": [
    { "card": "UP-79399", "repos": ["trainerize-migration-tool"],
      "firstAt": "2026-10-06T09:12:00+07:00", "lastAt": "2026-10-06T15:40:00+07:00",
      "subjects": ["key prescription cache by name + info"],
      "types": ["fix"], "mergedPrs": [121],
      "commits": [{ "repo": "…", "sha": "abc1234", "at": "…", "subject": "fix(truecoach): UP-79399 …" }] }
  ],
  "reviews": [
    { "card": "UP-76078", "repo": "Everfit-io/everfit-api", "pr": 19731,
      "title": "fix(key-metric-preference): UP-76078 …", "state": "APPROVED", "at": "…" }
  ],
  "unmatched": [{ "repo": "…", "sha": "…", "subject": "chore: bump deps" }],
  "errors": [{ "root": "~/missing", "error": "ENOENT" }]
}
```

Pure, exported functions (tested via `require`; CLI runs only when `require.main === module`):
- `parseArgs(argv)` → opts | throws `UsageError`
- `vnDayWindow(date, tz)` → `{ startMs, endMs }` (half-open)
- `extractCard(subject, refs)` → card | null (subject first, then `%D` refs)
- `stripSubject(subject, card)` → drop `type(scope): ` prefix, card ID, trailing `(#N)`
- `groupCommits(commits, window)` → `{ cards, unmatched }` (author-date bucket, dedupe subjects, sort by `firstAt`)
- `bucketReviews(reviews, login, window)` → kept reviews (latest per PR)

## Related Code Files
- Create `plugins/rock288/skills/ef-logwork/scripts/git-activity.cjs`
- Create `plugins/rock288/skills/ef-logwork/scripts/git-activity.test.cjs`

## Implementation Steps
1. Header doc block + usage (copy `worktree.cjs` header style).
2. `parseArgs`: validate `--date` `^\d{4}-\d{2}-\d{2}$`, `--tz` `^[+-]\d{2}:\d{2}$`; expand `~`.
3. Repo discovery: each root's direct children where `.git` exists (dir **or** file → worktrees). Missing root → `errors[]`.
4. Per repo: `git -C <repo> log --all --no-merges --author=<email> --since=<date-1>T00:00:00<tz> --until=<date+2>T00:00:00<tz> --format=%h%x1f%aI%x1f%s%x1f%D`; split on `\x1f`.
5. `groupCommits`: keep `Date.parse(aI)` in window; card via `extractCard`; collect `types` from conventional prefix, `mergedPrs` from `(#N)` suffix.
6. Reviews (skip on `--no-reviews` or `gh` missing → `errors[]`): login = `--gh-login` or `gh api user --jq .login`; `gh search prs --reviewed-by=@me --updated=>=<date-1> --json number,title,repository,url --limit 50`; per PR `gh api repos/<nwo>/pulls/<n>/reviews` → `bucketReviews`; card from title.
7. `JSON.stringify(result, null, 2)` to stdout; exit 0. Usage error → stderr + exit 2.
8. Tests (temp repos under `fs.mkdtempSync(os.tmpdir())`, commits via `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` env, `user.email` set per repo):
   - `2026-10-06T08:00:00+07:00` included; `2026-10-05T23:30:00+07:00` and `2026-10-07T00:10:00+07:00` excluded
   - `2026-10-05T18:00:00-07:00` (= 10-06 08:00 VN) included — tz conversion
   - author `2026-10-06`, committer `2026-10-08` (rebased) → included
   - card from subject; card from branch ref only; no card → `unmatched`
   - other author's commit excluded; merge commit excluded
   - same subject in 2 repos → 1 subject, 2 repos
   - missing root → `errors[]`, exit 0; `--date=2026-13-01` → exit 2
   - `bucketReviews` unit: other login dropped, out-of-window dropped, 2 reviews same PR → latest kept
   - `stripSubject('fix(truecoach): UP-79399 key cache (#121)', 'UP-79399')` → `key cache`
9. Run `node plugins/rock288/skills/ef-logwork/scripts/git-activity.test.cjs` → all pass; then smoke on real data: `--date=2026-10-05` should list UP-79399 + UP-79336 from `trainerize-migration-tool`.

## Todo List
- [x] `git-activity.cjs` CLI + pure exports
- [x] repo discovery incl. worktree `.git` files
- [x] widened log + author-date bucketing
- [x] card extraction / subject stripping / dedupe
- [x] PR review collection via `gh api …/reviews`
- [x] `git-activity.test.cjs` all cases green
- [x] real-data smoke on 2026-10-05

## Success Criteria
- Test file exits 0, every case listed in step 8 present. ✅
- Smoke run returns UP-79399 + UP-79336 for 2026-10-05; zero commits from other authors. ✅

## Implementation Notes

**Completed**: git-activity.cjs + git-activity.test.cjs (30/30 pass), real smoke 2026-10-05 → UP-79399 + UP-79336, zero foreign commits, ~3.5s (<5s budget).

**Deviations from spec**:
- `git log --since=date-1` with NO `--until` — rebased commits' committer date can be arbitrarily later, so hard cutoff avoided.
- `--source` + `%S` for non-tip branch commits + first-parent mainline filter (`develop/main/master`) to prevent pre-fork develop commits from inheriting feature card.
- Per-commit + per-card `cardFrom: subject|branch` tracking added.
- `--projects=UP,CHAL` allow-list implemented (PR-12, GPT-4 are false keys).
- gh reviews fetched concurrently (pool of 8), search with `--sort updated --order asc --limit 100` + `errors[]` recorded when limit hit.
- Reviews on own PRs dropped automatically.
- Verdict precedence: APPROVED > CHANGES_REQUESTED > COMMENTED (later verdict can't downrank earlier).
- Author match uses `--fixed-strings --regexp-ignore-case`.

## Risk Assessment
- `gh` rate limit with many reviewed PRs → cap `--limit 50`, one `reviews` call per PR.
- Repos nested deeper than 1 level missed → documented; `--roots` accepts extra roots.
- Squash-merge commits on `develop` authored by the PR author appear again on merge day → acceptable: they describe the same card; dedupe by subject.

## Security Considerations
- `execFileSync` with arg arrays only; no user string reaches a shell.
- Output contains only commit subjects / PR titles — no tokens.

## Next Steps
Phase 2 consumes the JSON.
