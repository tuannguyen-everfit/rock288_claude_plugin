---
name: rk:branch-name
description: "Generate Everfit-style branch from a Jira card link AND create it locally off the latest base branch (default: develop). Format: dev_<sprint>.<type>/<CARD-ID>-<slug>. Example: dev_s9_26.feat/UP-70961-auth. Triggers on: 'branch name', 'tạo branch', 'new branch from jira', 'generate branch'."
argument-hint: "<jira-link-or-card-id> [--sprint=<sprint>] [--type=<feat|fix|...>] [--base=<branch>] [--no-checkout] [--dry-run]"
metadata:
  author: rock288
  version: "1.1.0"
---

# Branch Name Generator

Produce a branch name in the team's house format from a Jira card link, then **create and check it out** off the latest base branch. The default flow always touches the working tree — use `--dry-run` for name-only output.

## Output format

```
dev_<sprint>.<type>/<CARD-ID>-<short-slug>
```

Examples:
- `dev_s9_26.feat/UP-70961-auth`
- `dev_10-26.feat/UP-70814`
- `dev_s11_26.fix/UP-72003-token-refresh`

## Inputs

| Arg | Required | Default | Notes |
|---|---|---|---|
| `<jira-link-or-card-id>` | yes | — | `https://everfit.atlassian.net/browse/UP-70961` or `UP-70961` |
| `--sprint=<sprint>` | no | inferred / asked | Free-form sprint label (`s9_26`, `10-26`, `s11_26`). Preserve user's exact casing. |
| `--type=<...>` | no | inferred from Jira issue type | `feat` \| `fix` \| `refactor` \| `perf` \| `chore` \| `docs` \| `test` |
| `--slug=<short>` | no | derived from card title | 1–3 kebab-case words. Strip stopwords. |
| `--base=<branch>` | no | `develop` | Branch to fetch + branch off. Falls back to `main`/`master` if `develop` does not exist on the remote. |
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
   - Pull `fields.summary` (title)
   - Pull `fields.issuetype.name` (issue type)
   - Pull active sprint name from `fields.customfield_*` (varies per workspace — try common keys; if not found, skip)
2. **Fallback — ask the user** via `AskUserQuestion`:
   - card title (one line)
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

### 4. Derive the slug

If `--slug` is provided, use it verbatim (after kebab-casing).

Otherwise from the card title:

1. Lowercase.
2. Strip the leading card ID if it appears in the title (e.g. `"UP-70961 Auth refresh"` → `"Auth refresh"`).
3. Strip stopwords: `a`, `an`, `the`, `add`, `fix`, `update`, `for`, `to`, `with`, `and`, `or`, `of`, `on`, `in`, `at`.
4. Take the **first 1–3 meaningful kebab-case tokens**. Prefer 1 token if the first noun is descriptive enough (e.g. `auth`, `webhook`, `tracking`). Cap total slug length at 24 chars.
5. Strip non-alphanumeric (keep `-`).

Examples:
- `"Auth refresh token expiry"` → `auth-refresh`
- `"Add Stripe webhook handler"` → `stripe-webhook`
- `"Fix swap-video-workout 400"` → `swap-video`
- `"Read-time library item overlay"` → `library-overlay`

### 5. Resolve sprint label

Order of precedence:
1. `--sprint=<value>` flag (verbatim).
2. Last-used sprint from memory (`memory/last_sprint.md` if present).
3. Active sprint from MCP if available — pass through verbatim (don't reformat).
4. Ask the user: "Sprint label (e.g. `s9_26`, `10-26`)?"

After resolving, **save it to memory** as the last-used sprint so future calls auto-pick it up.

### 6. Assemble + validate

```
dev_<sprint>.<type>/<CARD-ID>-<slug>
```

Validation rules:
- Total branch length ≤ 80 chars (Git is fine, but reviewers hate long names).
- Only `[A-Za-z0-9._/-]` characters.
- No trailing `-`, `.`, or `/`.
- No `//` or consecutive `..`.

If validation fails, fix the slug (truncate or simplify) and warn.

### 7. Pre-flight working-tree check

Before mutating anything, inspect the repo state with `git status --porcelain` and `git rev-parse --abbrev-ref HEAD`:

- **Dirty tree** (any output from `--porcelain`): print the dirty files and ask via `AskUserQuestion` whether to (a) `stash + checkout + pop`, (b) `commit first` (abort), or (c) `proceed anyway`. Default to **commit first** — don't silently stash someone's work.
- **Detached HEAD**: refuse and report. The user must check out a real branch first.
- **Not a git repo**: fall back to `--dry-run` behavior (print the name) and warn.

### 8. Resolve base branch + fetch latest

1. Base = `--base=<branch>` if given, else `develop`. If neither `origin/develop` nor a local `develop` exists, try `main`, then `master`. Warn when the fallback kicks in.
2. `git fetch origin <base> --prune` — pull the latest tip without touching the working tree.
3. Confirm `origin/<base>` exists after fetch. If not, abort with a clear error.

### 9. Create + check out the branch

Default behavior — always runs unless `--no-checkout` / `--dry-run` is set.

1. **Pre-existence check.**
   - `git rev-parse --verify <branch>` succeeds → local branch already exists. Ask the user: `switch to existing` (a) or `abort` (b). Never auto-delete.
   - `git ls-remote --exit-code --heads origin <branch>` succeeds → remote branch exists. Surface this; default to switching to a local tracking branch (`git checkout -b <branch> origin/<branch>`).
2. **Create.** `git checkout -b <branch> origin/<base>` — branches off the freshly fetched tip, leaving local `develop` untouched.
3. **Verify.** `git rev-parse --abbrev-ref HEAD` must equal `<branch>`. Print success or surface the actual HEAD.

### 10. Output

Print the final branch name on its own line, then a summary block:

```
dev_s9_26.feat/UP-70961-auth

Source:
  - Jira: UP-70961 — "Auth refresh token expiry" (Story)
  - Sprint: s9_26 (from memory)
  - Type: feat (mapped from Story)
  - Slug: auth (truncated from "auth-refresh")

Branch:
  - Base: origin/develop @ a1b2c3d (fetched just now)
  - Checked out: yes
  - HEAD: dev_s9_26.feat/UP-70961-auth
```

With `--no-checkout` / `--dry-run`, omit the `Branch:` block and instead print the planned commands so the user can run them manually.

## Style rules

- **Sprint label is verbatim** — don't reformat `s9_26` → `S9-26` or vice versa. Preserve user/MCP casing.
- **Card ID is uppercase** — `UP-70961`, not `up-70961`.
- **Slug is lowercase kebab-case** — no underscores, no camelCase.
- **Type is lowercase** — `feat`, not `Feat`.

## Edge cases

- **Card title is in Vietnamese** (e.g. `"Sửa lỗi đăng nhập"`): translate-by-skill to a 1-token English slug (`login-fix`) or ask the user for a slug if unsure. Don't transliterate diacritics.
- **No Jira access + user can't recall title**: accept the card ID alone and use it as the slug (`dev_s9_26.feat/UP-70961`). The trailing `-<slug>` is optional per the format.
- **Slug already contains the type word** (e.g. card title is `"Fix auth bug"` mapped to `fix`): drop the redundant `fix` from the slug.

## Safety rules

- **Never run `git reset --hard`, `git checkout -- .`, or `git clean -fd`.** If the tree is dirty, ask — don't delete.
- **Never overwrite an existing branch.** No `git branch -f`, no `-B`.
- **Never push.** This skill stops at local checkout. Pushing is `/rk:git`'s job.
- **Never modify `develop` / `main` / `master`.** Fetch updates remote-tracking refs only; the local base branch is left alone.

## When NOT to use this skill

- Hotfix branches off `main` (different convention — usually `hotfix/<short>`).
- Release branches (`release/v1.2.3`).
- Personal sandbox branches.

## Related

- [[rk:pr-description]] — generates the PR body for this branch
- [[rk:git]] — handles commit/push/PR flow after branching
