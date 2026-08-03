---
name: update-env
description: "Sync the default.env file of an everfit-style Node.js repo (everfit-api, metric-service, file-service, etc.) with env vars actually used in the code. Triggers on 'update env', 'update default.env', 'sync env', 'cập nhật default.env', 'thiếu env', 'check missing env'. Scans common/config/*.js Joi schemas + greps process.env.* across the codebase, then adds missing keys (with Joi defaults if available) and reports orphans without deleting."
argument-hint: "[--source=<repo-path>] [--env-file=<path>] [--write] [--report=<path>]"
metadata:
  author: rk
  version: "1.0.0"
---

# Update Env

Keep `default.env` in sync with the env vars the code actually reads. Designed for repos following the everfit-api pattern: a `common/config/` folder of Joi schemas plus scattered `process.env.X` reads.

## When to use

- A new env var was added to a Joi schema or `process.env.X` call but `default.env` still doesn't list it.
- Need to see which keys in `default.env` are no longer referenced anywhere.
- Onboarding a new env / deployment and want a complete env template.

## Inputs

- `--source=<path>` (optional) — repo root. Default: current working directory.
- `--env-file=<path>` (optional) — env file to update. Default: `<source>/default.env`.
- `--write` (optional) — actually append missing keys. Without it the script runs as dry-run and only prints the diff.
- `--report=<path>` (optional) — write a markdown report. Default: `plans/reports/update-env-<date>.md` if a `plans/reports/` dir exists, else stdout-only.

## How it works

1. **Joi pass** — walk `<source>/common/config/*.js`. For every `joi.object({ ... })` block, capture each `KEY: joi.<type>(...)` line and (if present) the `.default(<literal>)` value. This is the authoritative source: types, defaults, and grouping by domain.
2. **Grep pass** — recursively grep every JS file in `<source>` (excluding `node_modules/`, `coverage/`, `data/`, `_templates/`, `combined.log*`, `common/config/`, and `conf/`) for `process.env.<KEY>` references. Collect into a set.
3. **Parse default.env** — read `<env-file>`. Capture both active (`KEY=value`) and commented-out (`# KEY=value`) keys.
4. **Diff**:
   - **Missing** = (Joi keys ∪ grep keys) − env keys → must be added.
   - **Orphans** = env keys − (Joi keys ∪ grep keys) → reported, never deleted.
5. **Append** (only with `--write`):
   - Group missing keys by their source config file (e.g. `# --- common/config/heart_rate.js ---`). Keys found only via grep go under `# --- process.env (ungrouped) ---`.
   - For each key, write `KEY=<joi_default_or_blank>`. When the Joi default isn't a simple literal (e.g. `new Date(...)`), leave value blank.
   - Always append at the end of the file. Never reorder or overwrite existing lines.

## Usage

Default flow — dry run first, then write:

```bash
# Dry run (default): print diff + report only
python3 plugins/rock288/skills/update-env/scripts/update_env.py \
  --source /Users/tuannguyen/Source/metric-service

# Actually append missing keys to default.env
python3 plugins/rock288/skills/update-env/scripts/update_env.py \
  --source /Users/tuannguyen/Source/metric-service \
  --write
```

## Workflow Claude should follow

1. Confirm the target repo. If user invoked the skill without `--source`, ask which repo (default: cwd).
2. Run dry-run first. Show the user the summary: # missing keys, # orphans, sample keys.
3. Ask user to confirm before re-running with `--write`. Show the appended diff with `git diff -- default.env`.
4. Save the markdown report under `plans/reports/` (if directory exists) so the user has a record of orphans for later cleanup.

## Caveats

- Joi parsing is regex-based, not AST. It catches the standard pattern (`KEY: joi.<type>(...)` on its own line) used in this codebase. Computed/conditional schemas, schemas split across helpers, or keys built dynamically are skipped — verify with grep results.
- Defaults like `new Date('...')`, function refs, or array literals are not extracted — those keys land with empty value and a `# complex default — see <file>` comment.
- The grep pass only scans `.js` files. If the repo has `.ts`/`.mjs`, extend the script's `EXTENSIONS` set.
- Never deletes or rewrites existing `default.env` content. Orphan cleanup is a manual decision.

## Output example

```
=== Env Sync Report (metric-service) ===
Joi schema keys:        312
process.env grep keys:  87  (38 also in Joi)
default.env keys:       295  (active=270, commented=25)

Missing in default.env: 12
  common/config/heart_rate.js:
    - HEART_RATE_GROUP_BY_MINUTES=2
    - IS_USING_NEW_HEART_RATE_DATABASE=false
  common/config/whoop.js:
    - WHOOP_CLIENT_ID=
  process.env (ungrouped):
    - DATADOG_PROFILING_ENABLED=
    ...

Orphans in default.env (not referenced in code): 4
  - LEGACY_S3_BUCKET
  - OLD_API_KEY
  ...

[dry-run] Use --write to append missing keys.
```
