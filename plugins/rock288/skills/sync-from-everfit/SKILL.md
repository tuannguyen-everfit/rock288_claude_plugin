---
name: rk:sync-from-everfit
description: "Compare files between a fork repo (e.g. metric-service, file-service) and the parent everfit-api repo, then list everfit-api commits that should be cherry-picked. Triggers on 'sync from everfit-api', 'compare metric-service vs everfit-api', 'tìm commit cần cherry-pick', 'check missing commits', 'find cherry-picks', 'so sánh code everfit-api metric-service'. Dual-channel discovery: blame on shared file lines + directory scan for new-file commits and blame-shadowed commits. Skips identical files; dedupes by git patch-id; drops merge commits and commits already in target; runs git apply --check to label each candidate 'clean' or 'manual check'."
argument-hint: "[--target=<path>] [--everfit=<path>] [--everfit-ref=<branch>] [--scope=<dir>] [--since=<date>] [--no-dir-scan] [--report=<path>]"
metadata:
  author: rk
  version: "1.2.0"
---

# Sync From Everfit

Find everfit-api commits a fork repo (default: metric-service) hasn't picked up yet, and tell the user which ones cherry-pick cleanly vs which ones need manual work.

## When to use

- Periodically syncing metric-service / file-service with everfit-api.
- After a long-running feature branch in everfit-api lands and you want to know what's worth porting.
- User asks "what commits is metric-service missing from everfit-api" or "compare these two repos".

## Inputs

- `--everfit=<path>` — source repo. Default: `/Users/tuannguyen/Source/everfit-api`.
- `--target=<path>` — fork repo. Default: `/Users/tuannguyen/Source/metric-service`.
- `--everfit-ref=<branch|tag|sha>` — which ref of the source repo to compare against. Default: `HEAD`. Use this to pick the env-matching branch (e.g. `master` for prod, `staging` for staging, `develop` for dev). The source repo's work tree is NOT touched — files are read via `git show <ref>:<path>` and `git ls-tree <ref>`.
- `--scope=<relpath>` — limit comparison to a subdir. Repeatable. Default: whole repo.
- `--since=<git-since>` — time bound for the directory-scan channel (`git log --since`). Default: `1 year ago`. Use `10 years ago` for a full sweep.
- `--no-dir-scan` — disable directory-scan channel. Falls back to blame-only (v1.1 behavior). Faster but misses new-file commits and blame-shadowed commits.
- `--report=<path>` — write Markdown report to this path. Default: `plans/reports/sync-from-everfit-<date>.md` if `plans/reports/` exists in cwd, else stdout.

The target side always uses the **checked-out work tree** (so `git apply --check` can run against it). To sync target against a different branch, check it out first.

## Algorithm

Two discovery channels feed one filter pipeline. Each candidate is labeled with its `source` (`blame`, `dir`, or `blame+dir`).

### Channel A — blame on shared files

1. **Find shared paths.** `git ls-files` in both repos, intersect by relative path.
2. **Skip identical files.** SHA-256 the contents — if equal, file is in sync.
3. **For each differing file, extract changed line numbers in the everfit-api version.** `git diff --no-index --unified=0` between target version and everfit-api version. Capture every `+` line.
4. **Blame those lines on everfit-api.** `git blame --porcelain -L<n>,<n>` per interesting line → set of commit SHAs that introduced each.

### Channel B — directory scan (added in v1.2)

5. **Enumerate non-merge commits in `everfit-api@ref` since `--since` that touched any directory present in target** (`git log --no-merges --since=<since> -- <dirs>`). Catches what blame misses:
   - **New-file commits** — feature lives in files that don't exist in target (e.g. a new `services/sync-X/index.js`). Channel A skips these because step 1 only considers shared paths.
   - **Blame-shadowed commits** — when commit A and commit B both touched a line, `git blame` only returns B. Channel B finds A independently.

### Common filter pipeline (channels merged)

6. **Filter:**
   - Merge commits (>1 parent) dropped — cherry-pick the originals (channel B usually finds them).
   - Commits already in `target`'s branch history (`git merge-base --is-ancestor <sha> HEAD`) dropped. (Plain `cat-file -e` is too loose for forks: the object DB keeps the parent repo's objects even when the commit was never applied to a branch.)
   - Dedupe by `git patch-id` so a rebased/amended duplicate doesn't list twice.
7. **Classify each remaining commit:**
   - Compute `allowed = files_in_commit ∩ files_in_target`.
   - If `allowed` is empty but some files live under a shared directory → label `manual check — introduces new files under shared dirs (N)`. The new files need manual scaffolding in target.
   - Else extract a patch limited to `allowed`, run `git apply --check`. Pass → `clean`. Fail → `manual check — <first git error line>`.
8. **Emit Markdown report.** Summary + a table sorted newest-first (with `Source` column), then per-commit detail with the suggested cherry-pick command.

### Why patch-id dedup

Commit SHAs differ across rebases and cherry-picks. `git patch-id` produces a stable ID derived from the patch content, so an amended/rebased duplicate gets the same ID and is folded into one row.

### Why `--since` is bounded by default

Channel B without a time bound would scan the entire `everfit-api` history (10+ years, 20k+ commits) for every run. The default `1 year ago` catches realistic sync workflows; widen with `--since="10 years ago"` for a full audit. Channel A is unaffected — blame always operates on the current file state.

## Usage

```bash
# Default: everfit-api → metric-service, full repo scan
python3 plugins/rock288/skills/sync-from-everfit/scripts/sync_check.py

# Limit to a subdir (faster, focused)
python3 plugins/rock288/skills/sync-from-everfit/scripts/sync_check.py \
  --scope modules/heart-rate \
  --scope common/config

# Different fork (file-service)
python3 plugins/rock288/skills/sync-from-everfit/scripts/sync_check.py \
  --target /Users/tuannguyen/Source/file-service \
  --report plans/reports/sync-file-service-260519.md

# Per-env: pick the everfit-api branch that matches your target env
# Prod sync (target on its production branch, everfit-api on master)
git -C /Users/tuannguyen/Source/metric-service checkout master
python3 plugins/rock288/skills/sync-from-everfit/scripts/sync_check.py \
  --everfit-ref master --scope modules/heart-rate

# Staging sync
git -C /Users/tuannguyen/Source/metric-service checkout staging
python3 plugins/rock288/skills/sync-from-everfit/scripts/sync_check.py \
  --everfit-ref staging --scope modules/heart-rate

# Full historical sweep (catches old missed commits)
python3 plugins/rock288/skills/sync-from-everfit/scripts/sync_check.py \
  --scope modules/body-metric-entry --since "10 years ago"

# Fast blame-only mode (skip dir-scan, fewer false positives)
python3 plugins/rock288/skills/sync-from-everfit/scripts/sync_check.py \
  --scope modules/heart-rate --no-dir-scan
```

## Workflow Claude should follow

1. Confirm `--everfit`, `--target`, and `--everfit-ref`. If user mentions an env (prod/staging/dev) but no ref, ask which branch they want on the everfit-api side and remind them to check out the matching branch on target first.
2. If the comparison would be large (no `--scope`), ask the user whether to scope it (suggest a domain dir, e.g. `modules/heart-rate`).
3. Run the script. Stream stderr progress to the user so they see "scanning X/Y files".
4. Save the report under `plans/reports/` when the directory exists. Otherwise print to stdout.
5. Summarize: how many `clean` vs `manual check`, top 3 commits by date, and a one-liner suggesting `git cherry-pick` for the clean ones.
6. Do NOT auto-cherry-pick — this is a discovery tool. The user decides what to port.

## Output example

```markdown
# Sync Check Report — everfit-api → metric-service

- Source: `/Users/tuannguyen/Source/everfit-api`
- Target: `/Users/tuannguyen/Source/metric-service`
- Scope: ['modules/heart-rate']
- Generated: 2026-05-19 17:42:11

**Shared files:** 38  |  **Differing:** 12  |  **Candidate commits:** 9 (after dropping merges, already-applied, patch-id duplicates)

- Clean: **5**
- Manual check: **4**

## Commits to consider (newest first)

Source legend: `blame` = found via line-blame; `dir` = found via directory scan (new files / blame-shadowed); `blame+dir` = both.

| Commit | Date | Author | Source | Message | Note |
|---|---|---|---|---|---|
| `a1b2c3d4e5` | 2026-05-12 | alice | blame+dir | fix: HR aggregation off-by-one | clean |
| `b2c3d4e5f6` | 2026-05-08 | bob   | dir       | feat: support Garmin HR webhook (new files) | manual check — introduces new files under shared dirs (3) |
| `c3d4e5f6a1` | 2026-04-30 | carol | blame     | refactor: split HR service | manual check — patch does not apply: modules/heart-rate/hr.service.js |
...
```

## Caveats

- Blame finds **the last** commit per missing line. If the same line was edited by commit A then commit B, only B is listed via channel A; channel B (dir-scan) finds A independently in v1.2+.
- **Channel B can over-include** — a 1-year scan of a busy module may yield hundreds of `manual check` rows where the fork intentionally trimmed code. Filter by the `Source` column: `blame+dir` is the strongest signal; `dir` alone often means "feature isn't ported yet" or "fork doesn't want this".
- Hash-based "already applied" check assumes the fork retains everfit-api hashes (works for git-based forks). For a fork without shared history, every commit is treated as missing — patch-id dedup still keeps the list small, and `git apply --check` still classifies correctly.
- `git apply --check` is conservative: a commit may still cherry-pick cleanly even if `--check` warns (3-way merge can resolve cases plain apply can't). Treat `manual check` as "look at this", not "do not pick".
- Files where the fork **trimmed** large unused chunks will produce many `manual check` rows — that's expected. Use `--scope` to focus on modules where the fork mirrors everfit-api closely (route-reachable modules per user convention).
- Binary files and renames are skipped by the diff pass.
- `--no-dir-scan` reverts to v1.1 behavior — faster, but will miss the kind of new-file feature commits the user actually wants to port (see v1.2 changelog motivation).

## Troubleshooting

### Report is huge / takes too long
**Cause:** No `--scope`, large repo.
**Solution:** Narrow with one or more `--scope=<subdir>` flags. Typical fast scopes for metric-service: `modules/<domain>`, `common/config`, `utils`.

### "Not a git repo: ..."
**Cause:** `--everfit` or `--target` points somewhere without `.git`.
**Solution:** Pass an absolute path to the repo root.

### Every commit is "manual check"
**Cause 1:** Fork heavily trimmed shared files.
**Cause 2:** Whitespace/EOL differences between the two repos.
**Solution:** Inspect one row's "Files in target also touched by this commit" — open the diff manually to see whether the commit is actually relevant. Consider adding `--scope` to the modules where the two repos line up.
