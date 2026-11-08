# Reach & Contracts

Run after Codebase Understanding, before the first plan file. **Never skipped**, `--fast` included. Output: one `## Reach & Contracts` section in `plan.md`, before the phases.

## Why this exists

72 Critical/Important findings from 24 real reviews (2026-06 → 2026-11). A third came from code or contracts outside the diff that the plan never read: a "mirrors rule X" where X's real condition differed (14%), another service's validator / an LLM schema / a vendor API assumed instead of read (11%), a caller or consumer left on the old behavior (8%). Another 10% were partial writes: a failure mid-way left rows marked done, and the re-run never retried them. Nearly all of it was knowable from the codebase before a line was written. Conventions, which `convention-grounding.md` already covers, were 4%.

"Consider race conditions" produces nothing cook can follow. Each block below produces rows with evidence; cook's `references/pre-review-self-check.md` checks the code against them.

## Evidence rule

Every row cites `file:line` (`repo:file:line` across repos) or a probe (command + trimmed output). A row without evidence is a guess: put it under **Unresolved** and ask. A block that does not apply: `n/a — <why>`. An omitted block is not valid.

## 1. Mirrored rules (always)

Every place the plan says the new code "mirrors", "matches", "same as", "like" or "reuses the rule of" existing code: quote the real condition.

| New behavior | Mirrors | Actual condition (quoted) | Source |
|---|---|---|---|
| bulk-select hides programs that cannot be re-imported | importer refusal | `status: { $in: ['migrated', 'partial'] }` | `importer/load.ts:88` |

- ❌ Warning text says FAILED programs "retry cleanly, like the importer" — the importer only loads `PENDING` (review of trainerize PR106).
- ✅ Quote the importer's filter; the warning text and the bulk-select both follow the quoted set.

## 2. Reach list (always)

- Every caller of a function whose signature, return value or behavior changes — grep, including files the plan would not otherwise touch.
- Every producer and consumer of a changed event / topic / queue / field.
- Every other entry point to the same behavior: a second importer, a CLI, a script, a cron, a backfill.
- The tests, fixtures, config and exports that must follow.

| Site | Kind | Changes? | Why / what |
|---|---|---|---|
| `sync/consumer.js:41` | consumer of `profile.updated` | yes | phase 2 adds the WL guard |
| `scripts/audit.js:12` | reads `source` | no — filters `source = 'manual'` only | |

That list is the scope: code outside it is an extra; a site missing from it is the finding reviewers write ("five more account-level consumers still write into WL profiles; the plan never lists them" — everfit-api 654).

Names another repo can depend on (route + fields, event + payload, collection + fields, env var, shared-package export): list them. `/rk:trust-loop` greps the sibling repos for them (its step 1, "Reach outside the repo").

## 3. Verified contracts (when the change calls or feeds anything it does not own)

Another service's endpoint or validator, a collection another team writes, an LLM structured-output schema, a vendor API, an MCP tool. For each: what the plan assumes, verified from the other side's source or one live probe — never from the caller's own code or the field name.

| Contract | Assumed | Verified by | Result |
|---|---|---|---|
| everfit-api `POST /exercise/add` → `tags` | tag names | `everfit-api/.../validators/exercise.js:23` | ObjectIds → map names first |
| OpenAI `strict: true` schema | optional props allowed | provider docs + one probe | every prop listed in `required`; optional = `["type", "null"]` |

- ❌ `is_deleted` assumed from the name — the real signal is `library_hidden` (trainerize PR113).
- Cannot verify (no source access, no sandbox) → **Unresolved**, ask.

## 4. Failure table (when one operation writes more than once)

Two or more writes — rows, stores, services, an event publish, a status/"done" marker. Per step: what stays persisted if the process fails or dies right after it, and how a re-run recovers.

| Step | Writes | Fails right after → state left | Re-run |
|---|---|---|---|
| 1 | insert username history | history row, username unchanged | upsert by `(user, old)` — no duplicate |
| 2 | update username | consistent | — |

- A "done" marker is written after the work it marks, never before.
- A re-run must neither duplicate (409, double insert) nor skip (marked done, work missing).
- Atomicity needed → name the transaction, or the ordering + idempotency key that replaces it.
- ❌ Partial provider failure marks rows processed → re-run never retries them (trainerize follow-up). ❌ Re-run after a partial failure hits 409, program stuck (trainerize contract review).

## 5. Config & defaults (when the code reads env / config / flags)

| Key | Default (source) | Behavior under the default |
|---|---|---|
| `APP_ENV` | `"local"` (`config/index.ts:9`) | rate limiter keys on the LB IP → everyone shares one bucket if unset in prod |

## In the plan

- `plan.md` gets `## Reach & Contracts` with the 5 blocks (or `n/a — why`), before the phases.
- Each failure-table row and each mirrored rule gets a named test in the phase that implements it (`test: re-run after step-1 failure does not 409`).
- A row that changed a design choice also gets a row in the decisions table.
- Pass this section to the planner subagent in its prompt; it does not inherit what you grepped.

## Anti-rationalization

| Thought | Reality |
|---|---|
| "I know how that rule works" | 10 findings said otherwise, and 6 of them were one read away. Quote it. |
| "The other service obviously accepts this" | 8 findings: it didn't. One grep in its validator or one probe. |
| "Finding callers is cook's job" | Cook implements the plan's scope. A caller missing here is missing from the code. |
| "It's one write, no failure table" | Count the status update and the event publish too. |
| "n/a everywhere" | Fine when true. Say why per block — a reviewer reads `n/a — no external call` and checks it. |
