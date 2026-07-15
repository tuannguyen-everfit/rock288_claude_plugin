---
name: rk:ef-branch-name
description: "Generate Everfit-style branch from a Jira card link AND create it locally off the latest tip of any base branch you pass (default: develop). Whatever branch you pass as --base, it fetches that branch's newest code from origin and splits the new branch from it. Format: dev_<sprint>.<type>/<CARD-ID>. Example: dev_s9_26.feat/UP-70961. Triggers on: 'branch name', 'tạo branch', 'new branch from jira', 'generate branch', 'branch off <branch>', 'tách branch từ <branch>'."
argument-hint: "<jira-link-or-card-id> [--sprint=<sprint>] [--type=<feat|fix|...>] [--base=<branch>] [--no-checkout] [--dry-run]"
metadata:
  author: rock288
  version: "2.1.0"
---

# Branch Name Generator

Produce a branch name in the team's house format from a Jira card link, then **create and check it out** off the latest base branch. The default flow always touches the working tree — use `--dry-run` for name-only output.

## Output format

```
dev_<sprint>.<type>/<CARD-ID>
```

Examples:
- `dev_s9_26.feat/UP-70961`
- `dev_10-26.feat/UP-70814`
- `dev_s11_26.fix/UP-72003`

## Inputs

| Arg | Required | Default | Notes |
|---|---|---|---|
| `<jira-link-or-card-id>` | yes | — | `https://everfit.atlassian.net/browse/UP-70961` or `UP-70961` |
| `--sprint=<sprint>` | no | inferred / asked | Free-form sprint label (`s9_26`, `10-26`, `s11_26`). Preserve user's exact casing. |
| `--type=<...>` | no | inferred from Jira issue type | `feat` \| `fix` \| `refactor` \| `perf` \| `chore` \| `docs` \| `test` |
| `--base=<branch>` | no | `develop` | **Any branch you pass here is fetched fresh from origin and used as the branch point** — not limited to develop/main. Give it a feature branch, a release branch, whatever. Falls back to `main`/`master` only when no `--base` is given and `develop` does not exist on the remote. |
| `--no-checkout` | no | off | Skip the working-tree mutation; still prints the resolved name + planned commands. |
| `--dry-run` | no | off | Alias for `--no-checkout`. Useful when piping the name into another tool. |

## Workflow

### 1. Parse the Jira reference

Accept any of:
- Full URL: `https://<workspace>.atlassian.net/browse/UP-70961`
- Short URL: `.atlassian.net/.../UP-70961`
- Bare ID: `UP-70961`

Extract `<CARD-ID>` via regex `[A-Z]+-\d+`.

### 2. Resolve card info

Try in order:

1. **Atlassian MCP**: `mcp__claude_ai_Atlassian__getJiraIssue` with the card ID.
   - Pull `fields.summary` (title) — for the output summary only, not part of the branch name
   - Pull `fields.issuetype.name` (issue type)
   - Pull active sprint name from `fields.customfield_*` (varies per workspace — try common keys; if not found, skip)
2. **Fallback — ask the user** via `AskUserQuestion`:
   - issue type (Story / Task / Bug / Tech Debt / Spike / Other)
   - sprint label (only if `--sprint` not provided)

### 3. Map issue type → branch type prefix

| Jira issue type | Branch type |
|---|---|
| Story | `feat` |
| Task | `feat` |
| New Feature | `feat` |
| Improvement | `feat` |
| Bug | `fix` |
| Defect | `fix` |
| Tech Debt | `refactor` |
| Refactor | `refactor` |
| Spike / Research | `chore` |
| Documentation | `docs` |
| Performance | `perf` |

If `--type` is provided, it always wins. If neither MCP nor the user provides a clear mapping, default to `feat` and warn.

### 4. Resolve sprint label

Order of precedence:
1. `--sprint=<value>` flag (verbatim).
2. Last-used sprint from memory (`memory/last_sprint.md` if present).
3. Active sprint from MCP if available — pass through verbatim (don't reformat).
4. Ask the user: "Sprint label (e.g. `s9_26`, `10-26`)?"

After resolving, **save it to memory** as the last-used sprint so future calls auto-pick it up.

### 5. Assemble + validate

```
dev_<sprint>.<type>/<CARD-ID>
```

Validation rules:
- Total branch length ≤ 80 chars (Git is fine, but reviewers hate long names).
- Only `[A-Za-z0-9._/-]` characters.
- No trailing `-`, `.`, or `/`.
- No `//` or consecutive `..`.

If validation fails, simplify the sprint/type and warn.

### 6. Pre-flight working-tree check

Before mutating anything, inspect the repo state with `git status --porcelain` and `git rev-parse --abbrev-ref HEAD`:

- **Dirty tree** (any output from `--porcelain`): print the dirty files and ask via `AskUserQuestion` whether to (a) `stash + checkout + pop`, (b) `commit first` (abort), or (c) `proceed anyway`. Default to **commit first** — don't silently stash someone's work.
- **Detached HEAD**: refuse and report. The user must check out a real branch first.
- **Not a git repo**: fall back to `--dry-run` behavior (print the name) and warn.

### 7. Resolve base branch + fetch its latest tip

The rule: **whatever branch is passed as `--base`, fetch its newest code from origin and split off that.** This is not restricted to develop/main — it works for any branch (feature, release, someone else's branch, etc.).

1. **Pick the base.** Base = `--base=<branch>` if given, else `develop`. The `main`/`master` fallback applies **only when `--base` was not given** and `develop` is absent on the remote — never silently swap out a base the user explicitly passed. Warn when a default fallback kicks in.
2. **Fetch its latest.** `git fetch origin <base> --prune` — pulls the newest tip of that branch into `origin/<base>` without touching the working tree.
3. **Resolve the branch point** (`<branch-point>`) in this order:
   - `origin/<base>` exists after fetch → **use `origin/<base>`** (freshest remote tip). This is the normal path for any passed branch.
   - Else local `<base>` exists but has no remote counterpart → warn ("`<base>` has no `origin/<base>` — branching off the local tip, which may not be up to date") and **use local `<base>`**. Do not abort just because the branch is local-only.
   - Else (no `origin/<base>`, no local `<base>`) → abort with a clear error naming the branch that couldn't be found.

### 8. Create + check out the branch

Default behavior — always runs unless `--no-checkout` / `--dry-run` is set.

1. **Pre-existence check.**
   - `git rev-parse --verify <branch>` succeeds → local branch already exists. Ask the user: `switch to existing` (a) or `abort` (b). Never auto-delete.
   - `git ls-remote --exit-code --heads origin <branch>` succeeds → remote branch exists. Surface this; default to switching to a local tracking branch (`git checkout -b <branch> origin/<branch>`).
2. **Create.** `git checkout -b <branch> --no-track <branch-point>` — where `<branch-point>` is the ref resolved in step 7.3 (`origin/<base>` normally, or the local `<base>` in the local-only fallback). This branches off the freshly fetched tip, leaving the base branch itself untouched. **`--no-track` is required**: without it the new branch tracks the base (e.g. `origin/develop`), which causes `git pull` to merge the base into the feature branch and `git push` to either fail or push into the base depending on `push.default`. With `--no-track`, the new branch has no upstream until the first `git push -u origin <branch>`, which sets tracking to `origin/<branch>` correctly.
3. **Verify.** `git rev-parse --abbrev-ref HEAD` must equal `<branch>`. Print success or surface the actual HEAD.
4. **First-push hint.** Print a one-liner reminder: `First push: git push -u origin <branch>` — so the user (or `rk:git`) sets tracking on the initial push.

### 9. Output

Print the final branch name on its own line, then a summary block:

```
dev_s9_26.feat/UP-70961

Source:
  - Jira: UP-70961 — "Auth refresh token expiry" (Story)
  - Sprint: s9_26 (from memory)
  - Type: feat (mapped from Story)

Branch:
  - Base: origin/develop @ a1b2c3d (fetched just now)
  - Checked out: yes (--no-track, no upstream set)
  - HEAD: dev_s9_26.feat/UP-70961
  - First push: git push -u origin dev_s9_26.feat/UP-70961
```

When a non-default base is passed (e.g. `--base=release/v2`), the `Base:` line names it so it's obvious what the branch was split from:

```
Branch:
  - Base: origin/release/v2 @ 9f8e7d6 (fetched just now, from --base)
  ...
```

With `--no-checkout` / `--dry-run`, omit the `Branch:` block and instead print the planned commands so the user can run them manually.

## Style rules

- **Sprint label is verbatim** — don't reformat `s9_26` → `S9-26` or vice versa. Preserve user/MCP casing.
- **Card ID is uppercase** — `UP-70961`, not `up-70961`.
- **Type is lowercase** — `feat`, not `Feat`.

## Edge cases

- **No Jira access + user can't recall issue type**: default to `feat` and warn — the card ID alone is enough for a valid branch (`dev_s9_26.feat/UP-70961`).
- **Card ID missing from input**: the format requires `<CARD-ID>` — abort and ask for a Jira link or bare ID.

## Safety rules

- **Never run `git reset --hard`, `git checkout -- .`, or `git clean -fd`.** If the tree is dirty, ask — don't delete.
- **Never overwrite an existing branch.** No `git branch -f`, no `-B`.
- **Never push.** This skill stops at local checkout. Pushing is `/rk:git`'s job.
- **Never modify the base branch** (`develop` / `main` / `master` or any branch passed via `--base`). `git fetch` updates remote-tracking refs only; the new branch splits off `origin/<base>` (or the local base in the local-only fallback), and the base branch itself is left alone — no checkout of it, no `git pull` on it, no reset.

## When NOT to use this skill

- Hotfix branches off `main` (different convention — usually `hotfix/<short>`).
- Release branches (`release/v1.2.3`).
- Personal sandbox branches.

## Related

- [[rk:ef-pr-description]] — generates the PR body for this branch
- [[rk:git]] — handles commit/push/PR flow after branching
