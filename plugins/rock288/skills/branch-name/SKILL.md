---
name: rk:branch-name
description: "Generate Everfit-style branch names from a Jira card link. Format: dev_<sprint>.<type>/<CARD-ID>-<slug>. Example: dev_s9_26.feat/UP-70961-auth. Triggers on: 'branch name', 'tạo branch', 'new branch from jira', 'generate branch'."
argument-hint: "<jira-link-or-card-id> [--sprint=<sprint>] [--type=<feat|fix|...>] [--checkout]"
metadata:
  author: rock288
  version: "1.0.0"
---

# Branch Name Generator

Produce a branch name in the team's house format from a Jira card link.

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
| `--checkout` | no | off | When set, also run `git checkout -b <branch>` after confirming. |

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

### 7. Output

Print the final branch name on its own line, then a summary block:

```
dev_s9_26.feat/UP-70961-auth

Source:
  - Jira: UP-70961 — "Auth refresh token expiry" (Story)
  - Sprint: s9_26 (from memory)
  - Type: feat (mapped from Story)
  - Slug: auth (truncated from "auth-refresh")
```

### 8. Optional: checkout

If `--checkout` is set:

1. Confirm with user (one-line yes/no via `AskUserQuestion` — `Create and switch to <branch>?`).
2. Run `git fetch origin && git checkout -b <branch> origin/<base-branch>`.
   - Default base branch: `develop` (matches PR 16944's base). User can override with `--base=<branch>`.
3. If branch already exists locally, abort with a clear error message.

## Style rules

- **Sprint label is verbatim** — don't reformat `s9_26` → `S9-26` or vice versa. Preserve user/MCP casing.
- **Card ID is uppercase** — `UP-70961`, not `up-70961`.
- **Slug is lowercase kebab-case** — no underscores, no camelCase.
- **Type is lowercase** — `feat`, not `Feat`.

## Edge cases

- **Card title is in Vietnamese** (e.g. `"Sửa lỗi đăng nhập"`): translate-by-skill to a 1-token English slug (`login-fix`) or ask the user for a slug if unsure. Don't transliterate diacritics.
- **No Jira access + user can't recall title**: accept the card ID alone and use it as the slug (`dev_s9_26.feat/UP-70961`). The trailing `-<slug>` is optional per the format.
- **Slug already contains the type word** (e.g. card title is `"Fix auth bug"` mapped to `fix`): drop the redundant `fix` from the slug.

## When NOT to use this skill

- Hotfix branches off `main` (different convention — usually `hotfix/<short>`).
- Release branches (`release/v1.2.3`).
- Personal sandbox branches.

## Related

- [[rk:pr-description]] — generates the PR body for this branch
- [[rk:git]] — handles commit/push/PR flow after branching
