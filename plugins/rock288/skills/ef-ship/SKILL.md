---
name: rk:ef-ship
description: "Commit + push the current Everfit feature branch and open a PR targeting develop in one shot. Parses the branch (dev_<sprint>.<type>/<CARD-ID>-<slug>) to build the commit subject `<type>(<feature>): <CARD-ID> <slug>`, asks for the feature scope, pushes with upstream tracking, opens the PR, then auto-chains rk:ef-pr-description to fill the body. Triggers on: 'ship', 'commit and push', 'create PR', 'tạo PR', 'commit + PR', 'push and PR'."
argument-hint: "[--feature=<scope>] [--draft] [--no-desc] [--assignee=<user>] [--no-assign] [--slack] [--slack-channel=<name>] [--slack-group=<group>] [--slack-mentors=<u1,u2,u3>] [--yes] [--dry-run]"
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
| `--assignee=<user>` | no | `@me` | GitHub username to assign on the PR. Default assigns the current authenticated user. Pass a username to assign someone else. |
| `--no-assign` | no | off | Skip assignment entirely. Wins over `--assignee`. |
| `--slack` | no | off | After PR is created, post `<group> <mentor1> [<mentor2> <mentor3>] <PR-URL>` to a Slack channel. Default is OFF to avoid accidental notifications. **Auto-enabled** if any of `--slack-mentors`/`--slack-channel`/`--slack-group` is passed — those flags imply the user wants to post. |
| `--slack-channel=<name>` | no | `C05F65TBB9P` (`#backend-review-code`) | Channel name or ID. Everfit default is the `#backend-review-code` channel (`C05F65TBB9P`) — hard-coded so no first-run lookup is needed. Passing this implies `--slack`. |
| `--slack-group=<group>` | no | from memory (default `backend`) | Single group mention in Slack syntax (e.g. `<!subteam^S0123ABC>`). For Everfit, this is always the `@backend` user group. Passing this implies `--slack`. |
| `--slack-mentors=<list>` | no | asked each ship | Comma-separated Slack **usernames** (handles), e.g. `tuannguyen,thanhnguyen`. 1–3 names accepted. Skill resolves each name to `<@U…>` via `slack_search_users` and caches the lookup in `mentor_roster` for future hits. Variable per ship — skill always asks unless this flag is passed. **Passing this implies `--slack`** — no need for the explicit `--slack` flag. |
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
  4. gh pr create --base develop --title "<subject>" [--draft] [--assignee @me]
  5. invoke rk:ef-pr-description on the new PR
  6. [--slack only] post "<group> <mentors...> <PR-URL>" to #<channel>

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
    [--draft] \
    [--assignee <user>]
  ```
  Default `<user>` is `@me` (the authenticated `gh` user). Pass `--no-assign` to omit the flag entirely. Capture the returned PR URL.

If PR already existed and was found in step 8, still apply the assignee:
```bash
gh pr edit <pr-number> --add-assignee <user>
```
(Skip when `--no-assign`.)

### 9. Chain `rk:ef-pr-description` (default ON)

Unless `--no-desc` is set, invoke [[rk:ef-pr-description]] with:
- the Jira card ID parsed in step 2
- the PR URL captured in step 8

The downstream skill handles fetching Jira context, generating the body, and updating the PR description. If the PR already has a non-empty body, the downstream skill is responsible for the update-vs-replace decision — this skill does not gate it.

### 10. Slack notification (opt-in via `--slack` or any `--slack-*` flag)

Runs when `--slack` is passed **OR** any of `--slack-channel` / `--slack-group` / `--slack-mentors` is passed (the presence of any Slack-related flag implies the user wants to post). Context: Everfit Slack workspace; channel is `#backend-review-code` (ID `C05F65TBB9P`); group is always `@backend`; mentors vary 1–3 people per ship.

1. **Channel is hard-coded** to `C05F65TBB9P` (`#backend-review-code`). No memory lookup, no search — just use this ID directly. `--slack-channel=<other>` overrides for a single run.

2. **Load other config** from `memory/ef_ship_slack.md` (per-repo). Expected fields:
   - `group` — single mention string for the backend user group, e.g. `<!subteam^S0123ABC|@backend>` (saved on first run)
   - `mentor_roster` — map of `username → { id: <@U…>, display_name: "…" }`. Cache for name→ID lookups so the skill doesn't search Slack on every ship. Auto-populated as new names get resolved.

   Flags `--slack-group`/`--slack-mentors` override individual fields for this run only (don't overwrite memory's `group`; do update `mentor_roster` with any new resolutions).

3. **First-run setup** for the backend group (only if missing from memory):
   - Call `mcp__claude_ai_Slack__slack_search_users` with query `backend` to surface the user group's ID; ask user to confirm.
   - Save as `<!subteam^S…|@backend>` syntax (rendered mention shows `@backend`) to `memory/ef_ship_slack.md`.

   **Important**: store mention strings verbatim — Slack only notifies on proper `<@U…>` / `<!subteam^S…>` syntax. Plain `@name` text won't ping anyone.

4. **Resolve mentors (every ship)** — 1–3 names, never auto-prefilled to last-used.

   **Input** — comma-separated Slack **usernames** (not display names, not IDs):
   - If `--slack-mentors=<list>` passed, parse the comma-separated names directly.
   - Otherwise ask the user via `AskUserQuestion`:
     - Show quick-pick options from `mentor_roster` (multi-select, max 3) — labels show `username (display_name)`.
     - Allow free-text input for new names (one or more, comma-separated).

   **Validate count**: 1 ≤ names ≤ 3. Reject 0 and >3.

   **Resolve each name → `<@U…>`**:
   - **Cache hit**: name is in `mentor_roster` → use cached `id`. No Slack call.
   - **Cache miss**: call `mcp__claude_ai_Slack__slack_search_users` with the name.
     - Prefer exact `name` match over `real_name`/`display_name`.
     - If exactly 1 candidate → use it. Cache `username → { id, display_name }` in `mentor_roster`.
     - If multiple candidates → ask user via `AskUserQuestion` to pick. Cache the choice.
     - If 0 candidates → abort the Slack step with a clear error: "User '<name>' not found in workspace". Don't fail the whole ship.

   **Output**: list of `<@U…>` mentions in the same order as input names.

5. **Build message** (minimal format):
   ```
   <group> <mentor1> [<mentor2> <mentor3>] <PR-URL>
   ```
   Space-separated, single line. Slack unfurls the PR URL into a preview card showing the title.

6. **Post** via `mcp__claude_ai_Slack__slack_send_message` with the resolved channel + message.

7. **Verify**: capture the returned timestamp (`ts`) and channel ID. If the send fails (channel not found, no permission), surface the error but **don't fail the whole ship** — the commit/push/PR already landed; Slack is a side-effect notification.

### 11. Output

```
Branch:   dev_s9_26.feat/UP-70961-auth
Commit:   feat(auth): UP-70961 auth-refresh
          (a1b2c3d)
Pushed:   origin/dev_s9_26.feat/UP-70961-auth (upstream set)
PR:       https://github.com/<org>/<repo>/pull/<n> [READY|DRAFT]
Assignee: @me (tuannguyen-everfit)
Body:     filled by rk:ef-pr-description ✓
Slack:    posted to #backend-review-code (ts 1716800000.001234) — group @backend + 2 mentors; skipped if --slack not passed
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
