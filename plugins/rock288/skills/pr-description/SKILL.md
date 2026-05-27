---
name: rk:ef-pr-description
description: "Generate full PR descriptions in English (default) from code changes + Jira card link. Produces Everfit-style markdown (Summary, Ticket, What changed, Test plan, Rollout). Pass --lang=vi for Vietnamese. Triggers on: 'pr description', 'tạo description PR', 'write PR body', 'generate PR description', 'commit description from jira'."
argument-hint: "<jira-link-or-card-id> [--scope=<scope>] [--lang=en|vi] [--draft]"
metadata:
  author: rock288
  version: "1.1.0"
---

# PR Description Generator

Produce a full PR description in the team's house style (see [`references/template.md`](references/template.md)) given:

1. **Code changes** — the actual diff in the working tree (or a specific commit range)
2. **Jira card link** — to extract ticket ID, title, type, parent epic

## Inputs

| Arg | Required | Default | Notes |
|---|---|---|---|
| `<jira-link-or-card-id>` | yes | — | Full URL (`https://everfit.atlassian.net/browse/UP-71331`) or just the ID (`UP-71331`) |
| `--scope=<scope>` | no | inferred from changed paths | Conventional-commit scope, e.g. `video-workout`, `assignment`, `payment` |
| `--lang=<en\|vi>` | no | `en` | Output language for the PR body. `en` matches the team default (see §Language); `vi` for VN-only reviewer audiences. |
| `--draft` | no | off | Skip the "you must run tests" gate — produce a draft body even if no test results are available |

## Workflow

### 1. Resolve the Jira card

Try, in order:

1. **Atlassian MCP**: call `mcp__claude_ai_Atlassian__getJiraIssue` with the parsed card ID. Extract `summary`, `issuetype.name`, `parent.key` (if any), `customfield_*` for sprint if present.
2. **Fallback — ask the user**: if MCP is unavailable or returns 404, use `AskUserQuestion` to collect:
   - `summary` (one-line title)
   - `issuetype` (Story / Task / Bug / Tech Debt / Spike)
   - `parent epic key` (optional)

Save the resolved fields into local memory for the session so later skills (e.g. `rk:ef-branch-name`) can reuse without re-fetching.

### 2. Gather code change context

Pick **one** source of diff, in this order of preference:

1. If the user passes a commit range like `HEAD~3..HEAD`, use that.
2. Else `git diff origin/main...HEAD` if branch is ahead of main.
3. Else `git diff --cached` (staged) and `git diff` (unstaged) combined.

Collect:
- File list (`git diff --name-only`)
- Per-file diff stat (`git diff --stat`)
- Full diff (capped — see safety below)
- Existing commit messages on this branch (`git log --format=%B origin/main..HEAD`) — these are the strongest signal about intent

**Safety cap:** if the full diff > 200KB, don't pipe it raw into the prompt. Instead summarise per-file: top-level symbols added/removed, then ask the user which files to expand.

### 3. Infer scope (if `--scope` not given)

- If all changed files share a `modules/<X>/` or `everfit/controller/<X>/` prefix → scope = `<X>`.
- Else pick the directory with the most changed lines.
- Else ask the user.

### 4. Render the template

Use [`references/template.md`](references/template.md) verbatim as structure. Fill in:

- **Title:** `<type>(<scope>): <CARD-ID> <one-line summary>` where `<type>` comes from the issue-type map below
- **Ticket line:** `**Ticket:** <CARD-ID>` (add `(parent epic: <PARENT>)` if a parent epic was resolved)
- **Summary:** 1–3 sentences. Lead with the verb (Replaces / Adds / Fixes / Removes). State what *changes* about behavior, not what files moved.
- **What changed:** group by subsystem (Schema / Helpers / Services / Endpoints / Middleware). Use bullet lists, link files with `` `path/to/file` `` (backticks, not raw paths). For multi-file changes use a Markdown table like the PR-16944 endpoints table.
- **Test plan:** checkbox list. `[x]` for verified, `[ ]` for deferred. Pull test counts from the commits' messages if mentioned (e.g. "523 passing").
- **Rollout:** state feature flag status (none / behind flag X) and rollback strategy. If unsure, ask.

### Issue-type → commit-type map

| Jira issue type | Commit type | Branch type |
|---|---|---|
| Story | `feat` | `feat` |
| Task | `feat` | `feat` |
| New Feature | `feat` | `feat` |
| Improvement | `feat` | `feat` |
| Bug | `fix` | `fix` |
| Defect | `fix` | `fix` |
| Tech Debt | `refactor` | `refactor` |
| Refactor | `refactor` | `refactor` |
| Spike / Research | `chore` | `chore` |
| Documentation | `docs` | `docs` |
| Performance | `perf` | `perf` |

If the Jira type is anything else, fall back to `chore` and warn.

### 5. Output

Write the rendered description to **stdout** (the conversation) — do **not** write it to a file unless the user passes `--save=<path>`.

End the response with a one-line summary: which sections were filled vs deferred, and whether any field had to be guessed (mark with `⚠️`).

## Language

**Default: English.** PR titles and bodies are written in English regardless of the chat language. Matches PR 16944 and the recent commit history (`feat(challenge): UP-71209 Update response structure ...`).

Override with `--lang=vi` when the PR audience is VN-only (e.g. internal QA / Ops-only changes). Even then:

- Card ID, file paths, symbol names, error codes, commit-type prefix (`feat` / `fix` / …), and CLI commands stay in English / verbatim.
- Section headings (`## Summary`, `## What changed`, `## Test plan`, `## Rollout`) stay in English so search / tooling that greps them keeps working.
- Only the prose inside each section flips to Vietnamese.

If the user passes the trigger in Vietnamese (`tạo description PR`) without `--lang`, the output is still English — the trigger language is not the body language. Mention this in the trailing summary if unsure.

## Style rules

- Match PR 16944's tone: terse, technical, factual. No marketing language.
- Code references in body: use backticks, not bare paths. For files in the repo, prefer GitHub blob links when the user passes a branch name.
- Tables for multi-row data (endpoints, files). Bullets for ≤ 5 items.
- Never invent test counts — only quote numbers found in commits or user input.
- Keep "What changed" granular but skip rote details (e.g. don't list every new test file).

## When NOT to use this skill

- Single-commit message body (use plain `git commit` flow).
- Releases / changelogs (different format).
- Internal design docs (those live under `docs/modules/<X>/`).

## Related

- [[rk:ef-branch-name]] — generates the matching branch name from the same Jira card
- [[rk:git]] — handles the actual commit/push/PR creation flow
