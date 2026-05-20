---
name: rk:sync-from-everfit
description: "Compare files between a fork repo (e.g. metric-service, file-service) and the parent everfit-api repo, then list everfit-api commits that should be cherry-picked. Triggers on 'sync from everfit-api', 'compare metric-service vs everfit-api', 'tìm commit cần cherry-pick', 'check missing commits', 'find cherry-picks', 'so sánh code everfit-api metric-service'. Skips identical files; uses git blame on differing lines + git patch-id dedup; drops merge commits and commits already in target; runs git apply --check to label each candidate 'clean' or 'manual check'."
argument-hint: "[--target=<path>] [--everfit=<path>] [--scope=<dir>] [--report=<path>]"
metadata:
  author: rk
  version: "1.0.0"
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
- `--scope=<relpath>` — limit comparison to a subdir. Repeatable. Default: whole repo.
- `--report=<path>` — write Markdown report to this path. Default: `plans/reports/sync-from-everfit-<date>.md` if `plans/reports/` exists in cwd, else stdout.

## Algorithm

1. **Find shared paths.** `git ls-files` in both repos, intersect by relative path.
2. **Skip identical files.** SHA-256 the contents — if equal, file is in sync.
3. **For each differing file, extract changed line numbers in the everfit-api version.**
   `git diff --no-index --unified=0` between target version and everfit-api version. Capture every `+` line (i.e., line present in everfit-api but missing/different in target).
4. **Blame those lines on everfit-api.** `git blame --porcelain -L<n>,<n>` per interesting line → set of commit SHAs that introduced each.
5. **Filter:**
   - Merge commits (>1 parent) dropped — cherry-pick the originals.
   - Commits already in `target`'s branch history (`git merge-base --is-ancestor <sha> HEAD`) dropped — already applied. (Plain `cat-file -e` is too loose for forks: the object DB keeps the parent repo's objects even when the commit was never applied to a branch.)
   - Dedupe by `git patch-id` so a rebased/amended duplicate doesn't list twice.
6. **Classify each remaining commit:**
   - Extract patch with `git show <sha>` filtered to only files present in target.
   - `git apply --check` against target work tree.
   - Pass → **`clean`** (cherry-pick should apply without conflict).
   - Fail → **`manual check`** with the first conflict line from git's error (e.g., the commit touches lines the fork intentionally trimmed).
7. **Emit Markdown report.** Summary + a table sorted newest-first, then per-commit detail with the suggested cherry-pick command.

### Why blame, not `--since`

Blame pinpoints exactly which commits introduced the lines that are currently missing in the fork. `--since` would either over-include (every commit touching the file in the window) or miss old commits that haven't been ported yet. Trade-offs:

- **Lines edited multiple times** → blame returns the latest commit; older revisions of that line are not listed. Usually fine — the latest version is what you want to port.
- **Lines the fork intentionally removed** → still blamed → listed as candidates → `git apply --check` fails → flagged `manual check`. User decides skip vs adapt.

### Why patch-id dedup

Commit SHAs differ across rebases and cherry-picks. `git patch-id` produces a stable ID derived from the patch content, so an amended/rebased duplicate gets the same ID and is folded into one row.

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
```

## Workflow Claude should follow

1. Confirm `--everfit` and `--target`. If user didn't pass them, use the defaults and tell the user which paths you're using.
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

**Shared files:** 38  |  **Differing:** 12  |  **Candidate commits:** 7 (after dropping merges & already-applied)

- Clean: **5**
- Manual check: **2**

## Commits to consider (newest first)

| Commit | Date | Author | Message | Note |
|---|---|---|---|---|
| `a1b2c3d4e5` | 2026-05-12 | alice | fix: HR aggregation off-by-one | clean |
| `b2c3d4e5f6` | 2026-05-08 | bob   | feat: support Garmin HR webhook | clean |
| `c3d4e5f6a1` | 2026-04-30 | carol | refactor: split HR service | manual check — patch does not apply: modules/heart-rate/hr.service.js |
...
```

## Caveats

- Blame finds **the last** commit per missing line. If the same line was edited by commit A then commit B, only B is listed; cherry-picking B without A may produce conflicts. The `git apply --check` step will catch this and flag `manual check`.
- Hash-based "already applied" check assumes the fork retains everfit-api hashes (works for git-based forks). For a fork without shared history, every commit is treated as missing — patch-id dedup still keeps the list small, and `git apply --check` still classifies correctly.
- `git apply --check` is conservative: a commit may still cherry-pick cleanly even if `--check` warns (3-way merge can resolve cases plain apply can't). Treat `manual check` as "look at this", not "do not pick".
- Files where the fork **trimmed** large unused chunks will produce many `manual check` rows — that's expected. Use `--scope` to focus on modules where the fork mirrors everfit-api closely (route-reachable modules per user convention).
- Binary files and renames are skipped by the diff pass.

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
