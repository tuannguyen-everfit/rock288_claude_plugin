# Pre-review Self-check

Run after Step 4 (Testing) and before Step 5 (Code Review); with `--no-test`, after Step 3. Mechanical: each check is a grep or a read, not an opinion. A finding caught here costs one edit; caught in review it costs a round.

## Inputs

The plan's `## Reach & Contracts` section and its acceptance criteria. No such section (ad-hoc task, older plan) → build the reach list (block 2) and the failure table (block 4) now, per `$SKILL_DIR/../plan/references/reach-and-contracts.md`, then check.

## Checks

| # | Check | How | Fail → |
|---|---|---|---|
| 1 | Every new name resolves | Each new `ref:` / registered model, queue, topic or event name / enum literal / config key / import path in the diff: grep its definition, spelled the way siblings spell it | fix the name |
| 2 | Reach list done | Each `yes` row changed in the diff; each `no` row still true. Grep callers of every export whose behavior changed — one missing from the list → add the row, handle it | fix + add row |
| 3 | Mirrored rules match | The new condition equals the quoted one: same set, same field, same order | align to the quote |
| 4 | Contracts honored | The payload / schema built matches the verified-contract rows | fix the payload |
| 5 | Failure table matches the code | Write order in code = table order; done-marker after the work; the re-run path (upsert, idempotency key, transaction) exists | fix order / add guard |
| 6 | External input guarded | Every read of a request / event / API / LLM / env value: null, empty and wrong-type decided — validated, defaulted or rejected, never assumed | add the guard |
| 7 | No swallowed errors | Every new `catch` rethrows, returns an error its caller checks, or logs with context and says why swallowing is right; every new check states fail-open or fail-closed | fix the handler |
| 8 | Risky rows tested | A negative test per failure-table row and per auth / security branch; assertions on side effects, not only status | write the test |
| 9 | Spec | Each acceptance criterion → `file:line`. Anything in the diff that no criterion or reach row asked for → remove, or justify in the report | remove / justify |

Any fix → re-run the tests before Step 5. With `--no-test`: check 8 → `n/a — no-test mode`, no test re-run.

Output: `✓ Step 4.5: Self-check 9/9 - [N] names resolved - [M] reach rows verified - [K] fixes`. A check skipped with no `n/a — why` = self-check not done.

**Delegating code to subagents:** paste the Checks table into the prompt of every subagent that writes code; it runs the table on its own files before reporting done.

## Not this

Not a review: no style, no "could be cleaner". It does not replace Step 5 — it removes what Step 5 would find mechanically, so the reviewer spends its budget on what only a reviewer finds.
