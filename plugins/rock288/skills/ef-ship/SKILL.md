---
name: rk:ef-ship
description: "Commit + push the current Everfit feature branch and open a PR targeting develop in one shot. Parses the branch (dev_<sprint>.<type>/<CARD-ID>-<slug>) to build the commit subject `<type>(<feature>): <CARD-ID> <slug>`, asks for the feature scope, pushes with upstream tracking, opens the PR, then auto-chains rk:ef-pr-description to fill the body. Triggers on: 'ship', 'commit and push', 'create PR', 'tạo PR', 'commit + PR', 'push and PR'."
argument-hint: "[--feature=<scope>] [--draft] [--no-desc] [--yes] [--dry-run]"
metadata:
  author: rock288
  version: "1.0.0"
---

# Ship: commit + push + open PR (Everfit flow)

Finalize a feature branch in one command: stage all working-tree changes, commit with the team's commit subject format, push to `origin` (sets upstream on first push), open a PR targeting `develop`, then chain [[rk:ef-pr-description]] to fill the PR body.

## Commit subject format

```
<type>(<feature>): <CARD-ID> <short-slug>
```

Examples:
- `feat(auth): UP-70961 auth-refresh`
- `fix(webhook): UP-72003 token-refresh`
- `refactor(workout): UP-70814 swap-video`

All fields except `<feature>` come from the current branch name (produced by [[rk:ef-branch-name]]). `<feature>` is user input.

## Inputs

| Arg | Required | Default | Notes |
|---|---|---|---|
| `--feature=<scope>` | no | asked | One-word feature/module name (kebab-case). Inserted as `<feature>` in commit subject. |
| `--draft` | no | off | Create the PR as draft. |
| `--no-desc` | no | off | Skip the auto-chain to `rk:ef-pr-description`. PR body left empty. |
| `--yes` | no | off | Skip the final confirmation gate before commit + push. |
| `--dry-run` | no | off | Print the planned commands without executing. |

## Workflow

### 1. Pre-flight checks

- `git rev-parse --is-inside-work-tree` — abort if not a git repo.
- `git rev-parse --abbrev-ref HEAD` — capture current branch.
- **Refuse on protected branches**: `develop`, `main`, `master`, `staging`, branches matching `release/*`. Abort with a clear error pointing to `rk:ef-branch-name`.
- `git status --porcelain` — if clean AND there are no unpushed local commits (`git log @{u}.. 2>/dev/null` is empty), abort with "nothing to ship".
- `gh auth status` — verify GitHub CLI is logged in. If not, surface `gh auth login`.

### 2. Parse current branch

Expect format `dev_<sprint>.<type>/<CARD-ID>-<slug>`. Regex:

```
^dev_(?<sprint>[^.]+)\.(?<type>feat|fix|refactor|perf|chore|docs|test)/(?<card>[A-Z]+-\d+)(-(?<slug>[a-z0-9-]+))?$
```

If branch doesn't match, fall back to `AskUserQuestion`:
- `<type>` (feat / fix / refactor / perf / chore / docs / test)
- `<CARD-ID>` (e.g. `UP-70961`)
- `<slug>` (optional, kebab-case)

### 3. Resolve `<feature>`

Order of precedence:
1. `--feature=<scope>` flag.
2. Last-used feature for this branch from memory (`memory/last_feature_<branch>.md` if present) — suggest, don't auto-apply.
3. Ask the user via `AskUserQuestion`: "Feature/scope for this commit (e.g. `auth`, `webhook`, `tracking`)?"

After resolving, save it to memory keyed by branch so re-ships in the same branch prefill.

Normalize: lowercase, kebab-case, strip non-`[a-z0-9-]`.

### 4. Build commit subject

Subject (target ≤ 72 chars):
```
<type>(<feature>): <CARD-ID> <short-slug>
```

If `<slug>` is missing from the branch, drop it:
```
<type>(<feature>): <CARD-ID>
```

No commit body — context belongs in the PR description.

### 5. Confirmation gate

Unless `--yes` is set, print the plan and ask via `AskUserQuestion` to proceed:

```
About to:
  1. git add -A   (N files changed, see below)
  2. git commit -m "<subject>"
  3. git push -u origin <branch>
  4. gh pr create --base develop --title "<subject>" [--draft]
  5. invoke rk:ef-pr-description on the new PR

Files staged:
  M  src/auth/refresh.ts
  A  src/auth/refresh.test.ts
  ...

Proceed?
```

Default action: `proceed`. Options: `proceed` / `abort`.

With `--dry-run`, print the plan and stop here.

### 6. Stage + commit

```bash
git add -A
git commit -m "<subject>"
```

If pre-commit hooks fail: surface the error and abort. **Don't `--no-verify`** unless the user explicitly passes the flag.

Verify with `git log -1 --pretty=%s` — must equal `<subject>`.

### 7. Push with upstream

```bash
git push -u origin <branch>
```

First push sets tracking to `origin/<branch>` (this completes the pairing with the `--no-track` step in [[rk:ef-branch-name]]). On subsequent ships, `-u` is harmless.

If push is rejected (non-fast-forward): surface the error, **never auto-force-push**. Suggest the user run `git pull --rebase origin <branch>` and re-ship.

### 8. Create PR

Check if PR already exists for this branch:
```bash
gh pr view --json number,url,title,isDraft 2>/dev/null
```

- **Exists** → skip creation. Capture `<pr-url>`. Print `Existing PR: <url>`.
- **Not exists** → create:
  ```bash
  gh pr create \
    --base develop \
    --title "<commit-subject>" \
    --body "" \
    [--draft]
  ```
  Capture the returned PR URL.

### 9. Chain `rk:ef-pr-description` (default ON)

Unless `--no-desc` is set, invoke [[rk:ef-pr-description]] with:
- the Jira card ID parsed in step 2
- the PR URL captured in step 8

The downstream skill handles fetching Jira context, generating the body, and updating the PR description. If the PR already has a non-empty body, the downstream skill is responsible for the update-vs-replace decision — this skill does not gate it.

### 10. Output

```
Branch:   dev_s9_26.feat/UP-70961-auth
Commit:   feat(auth): UP-70961 auth-refresh
          (a1b2c3d)
Pushed:   origin/dev_s9_26.feat/UP-70961-auth (upstream set)
PR:       https://github.com/<org>/<repo>/pull/<n> [READY|DRAFT]
Body:     filled by rk:ef-pr-description ✓
```

With `--dry-run`, the block shows each step as `(planned)`.

## Style rules

- **Subject is one line, ≤ 72 chars, no trailing period.**
- **`<feature>` is lowercase kebab-case, 1–2 words max.**
- **`<CARD-ID>` is uppercase** — `UP-70961`, not `up-70961`.
- **`<slug>` is lowercase kebab-case** — same casing as the branch.

## Edge cases

- **No working-tree changes but local commits unpushed**: skip steps 6 (stage + commit) and go straight to push + PR creation. Surface the existing local commits in the confirmation gate so user knows what's about to ship.
- **PR already exists**: skip `gh pr create`. Still chain `rk:ef-pr-description` unless `--no-desc` — let it decide whether to update.
- **Repo has no `develop` branch on remote**: abort with a clear error. Don't silently re-target `main`. (Use `gh pr create --base <other>` manually if needed.)
- **`<feature>` collides with `<type>` word** (e.g. `feat(feat): ...`): warn and re-prompt for a clearer scope.
- **Commit subject exceeds 72 chars**: warn but proceed. Don't truncate silently — the user can shorten `<feature>` or `<slug>` and re-ship.

## Safety rules

- **Never `--force` push** (no `--force-with-lease` either unless user explicitly asks).
- **Never `--no-verify`** unless user passes the flag.
- **Never commit on `develop` / `main` / `master` / `staging` / `release/*`** — refuse upfront.
- **Never `--amend`, never rebase.** One ship = one new commit on top.
- **Never delete or rename branches.**

## When NOT to use this skill

- Hotfix branches on `main` (different convention).
- Release branches (`release/v*`).
- Multi-commit work that should be split by file/scope — use [[rk:git]] for smart-split commits instead.
- Personal sandbox branches without a Jira card.

## Related

- [[rk:ef-branch-name]] — creates the branch this skill operates on.
- [[rk:ef-pr-description]] — chained automatically after PR creation to fill the body.
- [[rk:ef-pr-comment]] — post inline review comments on an existing PR.
- [[rk:git]] — alternative for smart-split commits when one-commit-per-ship isn't enough.
