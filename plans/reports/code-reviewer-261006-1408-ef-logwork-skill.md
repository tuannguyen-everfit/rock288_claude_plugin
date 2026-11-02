# Code Review — `ef-logwork` skill (uncommitted, main)

## Scope
- `skills/ef-logwork/scripts/git-activity.cjs` (341), `git-activity.test.cjs` (329), `SKILL.md` (139), `references/{format-rules,worklog-ledger,audit}.md`, `memory/logwork.md`; manifests 4.2.2→4.3.0, `scan_skills.py`, `skills_data.yaml`
- Tests: `node plugins/rock288/skills/ef-logwork/scripts/git-activity.test.cjs` → **23 passed, 0 failed**
- Experiments I ran in the scratchpad: a fork-point repo to check `--source` attribution, git `--since` parsing of `YYYY-MM-DDT00:00:00+07:00` (parsed correctly), and `extractCard`/`stripSubject` edge inputs

## Verdict on the 6 deliberate deviations
| # | Verdict |
|---|---|
| 1 `--since=date-1`, no `--until` | Sound. git parses the ISO+offset form correctly, and committer ≥ author holds in practice. The only cost is a longer log for past dates. |
| 2 `--source` + `%S` | **Partly unsound.** It attaches the wrong card to commits at and below a fork point (see I1). |
| 3 Concurrent gh | Sound, but concurrency is unbounded (see M8). |
| 4 `General Task` JQL + client filter | Sound. |
| 5 NON_CARD_PREFIXES | Fine as cosmetic filtering, but the "real safety net" probably fails closed (see I2). |
| 6 Drop reviews on own PRs | Sound. |

## Critical
None. No shell interpolation anywhere: `execFile`/`execFileSync` always get argv arrays, including `--updated=>=…` and `repos/${nwo}/…`. Jira writes are behind draft→confirm, and `--audit` has no write path.

## Important

**I1. `%S` gives the wrong card to pre-fork commits on the mainline.** `git-activity.cjs:255,263`
I reproduced it. On develop: `chore: base` 08:00 → `fix typo in readme` 09:00 (both mine, no card). `feat/UP-200` forks at 09:00 (`add endpoint` at 11:00). develop then gets a newer commit at 10:00. Output: `UP-200 subjects: ["base","fix typo in readme","add endpoint"]`. git propagates a source from the first child it walks (newest first), so every card-less mainline commit below the fork inherits the feature ref. The Jira key lookup cannot catch this because UP-200 is a real card.
Fix: per repo, build the mainline set once with `git rev-list --first-parent --since=<since> <each existing of develop, main, master, origin/develop, origin/main, origin/master>`. Ignore `%S` for any sha in that set. Feature commits merged with `--no-ff` are not on the first-parent chain, so the CHAL-399 case still works. Also emit `cardFrom: "subject"|"branch"` so SKILL step 4 can tag branch-derived rows `(từ branch)`. Add this repro as a fixture.

**I2. The `key in (…)` safety net probably errors out instead of filtering.** `SKILL.md:75-77`
Jira normally rejects the whole JQL with `An issue with key 'X-1' does not exist for field 'key'` if any key in the list doesn't exist. Please confirm with one read-only query. If that's what happens, a single false positive kills the lookup for every card, so step 5 has no issuetype and step 6 no status. False positives are easy to get: `GPT-4`, `COVID-19` and `PR-12` all come back as cards, and in `PR-12 UP-123 fix` the false `PR-12` hides the real `UP-123`.
Fix (best): add a `card_projects: UP, CHAL` config key and a `--projects=UP,CHAL` script flag, and build CARD_RE from that allowlist. The denylist then goes away. Fallback in SKILL: if the JQL error names a key, move that key to unmatched and retry (max 3 times).

**I3. Nothing pins the VN date, and the draft doesn't show it.** `SKILL.md:30,71,102-103`
Without `--date`, the model uses its own idea of "today", which is the session-start date and goes stale in long or resumed sessions. Under `--no-git` the script never runs, so nothing cross-checks it. The draft only shows `started (HH:MM)`, so a wrong date gets past the confirmation step.
Fix: add step 0, "date = `--date` or `TZ=Asia/Ho_Chi_Minh date +%F`". Put a draft header like `Ngày log: 2026-10-06 (Tue, VN)` and repeat it in the echo.

**I4. `--yes` skips confirmation even when warnings exist.** `SKILL.md:91-98,104`
Validation is "warn, never block". So `--yes` writes on a weekend date without anyone answering "đúng ngày chưa?", and the same goes for Done cards and ≥ 8h per card.
Fix: "`--yes` auto-confirms only a draft with zero ⚠; any ⚠ → wait. `--dry-run` beats `--yes`."

**I5. The edit-worklog instructions contradict each other and are unverified.** `SKILL.md:132-133` vs `audit.md:5` and the brainstorm (`addOrEditJiraIssueWorklog` = add+edit)
If `addWorklogToJiraIssue` ignores an unknown `worklogId`, a "fix" creates a duplicate worklog, and there is no delete tool.
Fix: name the exact edit tool and server (and `executeWrite` if needed), verify it once, and use the same name everywhere.

**I6. PR search can silently truncate.** `git-activity.cjs:271-272`
`--limit 50` with the default `best-match` sort and no upper bound on `updated`. For past dates, or for a busy reviewer, PRs that were reviewed on that day can fall past 50 with no `errors[]` entry.
Fix: `--sort updated --order asc --limit 100`, and push `{source:'gh', error:'search truncated at 100'}` when `prs.length === limit`.

**I7. `--audit` and `--dry-run` config writes are ambiguous.** `SKILL.md:54-55,58,66`
Step 1 says "write the file" and only exempts `--dry-run`, not `--audit`, while audit.md:5 says "no config write either". Step 2's `--shared → save` and the sprint-change save don't repeat the dry-run exemption.
Fix: one guard line at the top of Workflow: "`--audit`: step 1 read-only (defaults if missing) → §Audit, never steps 2–9. `--dry-run`: no writes in any step."

## Minor
- **M1** `git-activity.cjs:30`: `\b` misses keys next to `_` or with a lowercase prefix: `feat/UP-300_cache`, `feat_UP-1` and `feat/up-79399-x` all give null (verified). Use `(?<![A-Za-z0-9])([A-Z][A-Z0-9]+-\d+)(?!\d)`. Low impact, since the house format puts the card at the end.
- **M2** `:106`: `split(card)` also eats the prefix of longer keys: `fix: UP-1 vs UP-12 drift` → `vs 2 drift` (verified). Replace with `new RegExp(card + '(?!\\d)', 'g')`.
- **M3** `:184`: keeping the latest review per PR means a thread reply after approving (a later COMMENTED review) turns the outcome into "commented". Rank APPROVED/CHANGES_REQUESTED above COMMENTED. Also, format-rules.md:71 has no mapping for `DISMISSED`.
- **M4** `:270-271`: `--gh-login` only changes the filter; the search still uses `@me`, so another login always gets empty output. Use `--reviewed-by=${opts.ghLogin || '@me'}`.
- **M5** `:236-238`: the BRE escaping breaks when gitconfig sets `grep.patternType=extended|perl`. Then `+` in `me+tag@x` acts as a quantifier and every commit is dropped without an error. Pass `--fixed-strings` (it applies to `--author`) and drop the escaping.
- **M6** `:79`: the `--tz` regex accepts `+99:99`, which gives a NaN window and silently empty output (verified). Check `Number.isFinite(vnDayWindow(...).startMs)` and hh ≤ 14.
- **M7** `:283,295`: an unexpected shape from gh (non-array JSON) throws a TypeError inside `collectReviews`. That rejects `collect()`, and the run exits 1 with no JSON, losing the git cards. Wrap the body in try/catch → `errors[]`. SKILL.md:71-72 also needs a line for the case where the script exits non-zero or prints no JSON: "warn, continue as `--no-git`".
- **M8** `:284`: up to 50 concurrent `gh api` processes can trip GitHub's secondary rate limit. Cap it at a pool of about 8; that is still well under 5s.
- **M9** format-rules.md: the regex on line 24 accepts a trailing `.`, but line 15 says no trailing period. Keyword matching (lines 40-47) is substring and case-insensitive: `cs` hits "metrics/docs", `off` hits "kickoff" (→ Leave), and `daily` hits "daily sync BE". Specify whole-word matching, first row wins, and ask when two rows match.
- **M10** format-rules.md:57: there is no rule for a review whose PR title has no card (`card: null`). Say: show `?` and ask, never fall back to the shared card silently.
- **M11** audit.md:12: today is in the default range, so it always shows ❌/⚠ before the day is over. Label it `(hôm nay — chưa hết ngày)` instead.
- **M12** The `skills_data.yaml` regen also flips `brainstorm.has_references` from false to true. That's correct (the folder exists) but unrelated, so mention it in the commit message.

## Edge cases from scouting
Fork-point source misattribution (I1, reproduced) · invalid keys failing JQL (I2) · stale session date (I3) · silent search truncation (I6) · underscore/lowercase branch keys (M1) · substring key collision (M2) · regex/patternType (M5) · NaN tz window (M6).

## Positive
- Tests are real git fixtures plus a stub `gh` on PATH. They cover the LA-offset commit, the rebased commit, a fork-duplicate subject, a merge commit, and `gh` failures.
- Day windows are half-open and bucketed on author date. Every timestamp is re-rendered in +07:00.
- Error isolation: one bad root, repo or PR goes to `errors[]` and the run still exits 0.
- The ledger doc catches the `data.` responseFields trap. The duplicate check makes re-running after a partial failure close to idempotent. A 403 never silently re-routes to another card.
- Conventions: bare slug = folder, both manifests at 4.3.0, `EXACT_CATEGORY_MAP` row added, no README, `.cjs` kebab-case.

## Recommended order
I1 → I2 → I3 → I4 → I5 → I7 → I6 → M7 → the rest.

## Score: **7.5 / 10**

## Unresolved questions
1. Does the Atlassian MCP `searchJiraIssuesUsingJql` return 400 or a warning for a non-existent key in `key in (…)`? (I2)
2. Which tool and server actually edits a worklog by `worklogId`? (I5)
3. Does `addWorklogToJiraIssue` really take `started`, `commentBody` and `contentFormat` with those names? The plan never shows it verified.

---

## Re-review (2026-10-06, after fixes)

Tests: **28 passed, 0 failed**. I re-read `git-activity.cjs`, SKILL.md, audit.md, format-rules.md, the ledger placement section and the config. I also ran a fresh scratchpad repo with gitconfig `grep.patternType=perl`, an author email containing `+`, stacked feature branches and a case-variant author email.

The live answers settle the original unresolved questions. Unknown keys in `key in (…)` are simply absent from the result. `addWorklogToJiraIssue` takes `worklogId`, so the edit path is right.

### Earlier findings
| ID | Status | Evidence |
|---|---|---|
| I1 | Fixed | `mainlineShas()` (`:265-271`) builds a first-parent set and refs are ignored for those shas (`:300`). The `leak` fixture uses my repro ordering. `cardFrom` is emitted, and SKILL step 4 tags branch-derived rows. |
| I2 | Fixed | `--projects` + `card_projects` config; `firstCard` skips foreign keys (`PR-12 UP-123` → UP-123). SKILL step 3 documents that unknown keys are absent. |
| I3 | Fixed | Step 0 runs `TZ=Asia/Ho_Chi_Minh date +%F`; the `Ngày log:` header appears on both the draft and the echo. |
| I4 | Fixed | `--yes` only auto-confirms a draft with zero ⚠; `--dry-run` beats `--yes` (flags table + step 7). |
| I5 | Fixed | Notes cite the verified schema; the other server's tool and its `comment` parameter are named. |
| I6 | Fixed | `--sort updated --order asc --limit 100`; an `errors[]` entry when the limit is hit; `Array.isArray` guard. |
| I7 | Fixed | Write guard at the top of Workflow covers both worklog and config writes under `--dry-run`/`--audit`. |
| M1–M11 | Fixed | Lookaround CARD_RE, regex `stripSubject`, tz range check, `--fixed-strings` (verified under `patternType=perl` with a `+` email), pool of 8, verdict precedence, `--reviewed-by=<login\|@me>`, whole-word keywords, `(?<!\.)`, null-card review → ask, audit excludes today / `⏳`, non-zero exit → `--no-git`. |
| M12 | Accepted | Will be called out in the commit message. |

### Remaining (all Minor, none blocking)
- **R1 — stacked branches still leak** (verified). With `feat/UP-200` forked from `feat/UP-100`, UP-100's card-less commits `a1`/`a2` land under UP-200. They are tagged `branch`, but `cardFrom` is per card: if the card also has one subject commit, the group reads `subject`. The leaked subjects then sort first and become the What with no tag.
  Fix: put `cardFrom` on each commit, set the card-level tag to `branch` if any commit is branch-derived, or build the What only from subject commits when there are any.
- **R2 — the author prefilter is case-sensitive** (`:290-291`). `--author` has no `-i`, while the post-filter (`:302`) is case-insensitive. A commit by `Me+Tag@x.io` with config `me+tag@x.io` is dropped silently (verified). This predates the fixes. Fix: add `--regexp-ignore-case`.
- **R3 — a mainline lookup failure drops the whole repo** (`:293`). `mainlineShas` sits inside the `git log` try, so if it fails, all of that repo's commits are dropped. Fix: give it its own try/catch and fall back to an empty Set. Very unlikely to happen.
- **R4 — audit doesn't use step 0's date.** audit.md:12 ("before today") and the `⏳` rule don't point at step 0, so the audit can still infer a stale "today". Add "today = step 0" to §Audit. Also, `<Ddd>` could come from `date +'%F %a'` instead of the model working out the weekday.
- **R5 — banner wording.** The IMPORTANT banner (SKILL.md:17-18) says config is rewritten only "under `--shared`", but steps 1–2 also save it.

### Re-score: **9 / 10**
No Critical or Important items remain.

---

## Final (2026-10-06)

Tests: **30 passed, 0 failed**.

| ID | Status | Evidence |
|---|---|---|
| R1 | Fixed | `groupCommits` (`:169-191`) keeps a `bySource` bucket per card. Card `subjects` come from subject commits whenever there are any, otherwise from branch commits. Every commit carries `cardFrom`. The `stack` fixture covers this. |
| R2 | Fixed | `--regexp-ignore-case` sits beside `--fixed-strings` (`:296-297`). |
| R3 | Fixed | `mainlineShas` has its own try with an empty-Set fallback (`:303-307`). A `git log` failure still goes to `errors[]`. |
| R4 | Fixed | audit.md:14 says "Today" = step 0. |
| R5 | Fixed | The SKILL.md:17-18 banner now lists every config save. |

Note (not a defect): when a card has subject commits, card-less commits on its own branch (e.g. `child polish`) are left out of `subjects`. They are still in `commits[]` with `cardFrom: "branch"`. Accepted, because it keeps leaked subjects out of the What.

**Final score: 9.5 / 10.** No Critical or Important items remain. Ready to commit, with M12 noted in the commit message.
