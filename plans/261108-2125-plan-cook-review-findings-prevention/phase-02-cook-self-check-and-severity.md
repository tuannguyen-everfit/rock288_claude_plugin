# Phase 2 — Cook side: pre-review self-check + severity alignment

Status: completed · Effort: ~50m · Base: `plugins/rock288/skills/cook/` · Depends on phase 1 (references `../plan/references/reach-and-contracts.md`)

## 1. NEW `references/pre-review-self-check.md` — copy verbatim

~~~~markdown
# Pre-review Self-check

Run after Step 4 (Testing) and before Step 5 (Code Review); with `--no-test`, after Step 3. Mechanical: each check is a grep or a read, not an opinion. A finding caught here costs one edit; caught in review it costs a round.

## Inputs

The plan's `## Reach & Contracts` section and its acceptance criteria. No such section (`--fast`, ad-hoc task, older plan) → build the reach list (block 2) and the failure table (block 4) now, per `../plan/references/reach-and-contracts.md`, then check.

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

Any fix → re-run the tests before Step 5.

Output: `✓ Self-check: 9/9 - [N] names resolved - [M] reach rows verified - [K] fixes`. A check skipped with no `n/a — why` = self-check not done.

**Delegating code to subagents:** paste the Checks table into the prompt of every subagent that writes code; it runs the table on its own files before reporting done.

## Not this

Not a review: no style, no "could be cleaner". It does not replace Step 5 — it removes what Step 5 would find mechanically, so the reviewer spends its budget on what only a reviewer finds.
~~~~

## 2. `SKILL.md`

- Flowchart: today `I[Review Gate]` after `H` is the human post-implementation gate, and the Step 5 code review has no node (`K[Test] --> L[Finalize]`, `J -->|Yes| L`). Replace `K --> L` with `K --> SC[Pre-review Self-check]`, `SC --> CR[Code Review<br/>0 Critical + 0 Important]`, `CR --> L`; replace `J -->|Yes| L` with `J -->|Yes| SC`. Node ids `SC`, `CR` are unused today. Matches `workflow-steps.md` order (Test → 4.5 → 5 → Finalize).
- Workflow Overview line: insert `[Self-check]` before the `[Review]` that follows `[Implement]`.
- New section after `## Convention Pre-flight`:
  ```markdown
  ## Pre-review Self-check (MANDATORY — before Step 5)

  Mechanical pass against the plan's **Reach & Contracts**: new names resolve, reach list done, mirrored rules match the quote, contracts honored, write order matches the failure table, external input guarded, no swallowed errors, negative tests for risky rows, every AC mapped to `file:line`. No section in the plan → build the reach list and failure table first. Output `✓ Self-check: …`. Full table: `references/pre-review-self-check.md` — paste it into any code-writing subagent's prompt.
  ```
- Mode table L106 `Auto if score≥9.5` → `Auto if 0 Critical + 0 Important`.
- Always-enforced L128 `User approval OR auto-approve (score≥9.5, 0 critical)` → `User approval OR auto-approve (0 Critical + 0 Important; findings per /rk:code-review buckets and finding gate)`.
- Anti-rationalization: add row `| "Tests pass, the reviewer will catch the rest" | Callers, contracts, write order and swallowed errors are greps. Run the self-check; let review find what greps can't. |`.
- References list: add `- references/pre-review-self-check.md - Pre-review self-check against the plan's Reach & Contracts`.
- `metadata.version`: `2.2.1` → `2.3.0`.

## 3. `references/workflow-steps.md`

- Between Review Gate 4 and Step 5, add `## Step 4.5: Pre-review Self-check` → "All modes: run `references/pre-review-self-check.md`. Output: `✓ Step 4.5: Self-check 9/9 - [K] fixes`". With `--no-test`: runs after Step 3.
- Step 5 L109 prompt → `prompt="Review changes per /rk:code-review. Report findings as Critical / Important / Nice-to-have; each bug/risk finding names a concrete input and the wrong result (finding gate). Plan: [plan-path] — check its Reach & Contracts rows.", description="Code review"`.
- L117 `Auto-approve if score≥9.5 AND 0 critical` → `Auto-approve if 0 Critical AND 0 Important`; `Auto-fix critical` → `Auto-fix Critical + Important`.
- Output line `✓ Step 5: Review [score]/10 - …` → `✓ Step 5: Review [C] Critical / [I] Important / [N] Nice-to-have - …`.
- Mode flow summary lines: insert `4.5` after `4` (and after `3` in no-test).

## 4. `references/review-cycle.md` — rewrite body

- Both cycles: reviewer returns `critical[]`, `important[]`, `nice[]` (code-review buckets). `must_fix = critical + important`.
- Interactive: display box sections `Critical (N): MUST FIX`, `Important (N): MUST FIX`, `Nice-to-have (N)`; branch on `must_fix > 0`; labels unchanged otherwise.
- Auto: `IF must_fix == 0 → approve (log nice-to-have)`; `ELSE IF cycle < 3 → fix must_fix, re-run tester, cycle++`; `ELSE → escalate`. Remove the score branch.
- Replace `## Critical Issues Definition` with `## Severity` → Critical: breaks or is exploitable on a shipped path (crash, data loss, auth bypass, dangling name that throws). Important: wrong result for a concrete input, written-rule violation, reach-list site not updated, risky branch untested. Nice-to-have: everything else. A finding without a concrete case is dropped, not downgraded.
- Output formats: score → counts (`✓ Step 5: 0 Critical / 0 Important / 2 Nice-to-have - Auto-approved`; `✓ Step 5: 3 must-fix → Fixed → 0 - Approved`).

## 5. Small line fixes
- `README.md:50` `Auto if score≥9.5` → `Auto if 0 Critical + 0 Important`.
- `references/intent-detection.md:57` `✓ (score≥9.5)` → `✓ (0 Critical + 0 Important)`.
- `references/subagent-patterns.md:52` prompt → same as Step 5 prompt (buckets + finding gate), `[phase]` kept.

## Todo
- [x] Create `references/pre-review-self-check.md`
- [x] `SKILL.md` section, flowchart, overview, mode table, gate, anti-rationalization, references, version
- [x] `workflow-steps.md` Step 4.5 + Step 5 + flow summary
- [x] `review-cycle.md` rewrite
- [x] README / intent-detection / subagent-patterns lines

## Done when
- `grep -rn -E "9\.5|score" plugins/rock288/skills/cook` → no hit about review score
- `grep -rn "pre-review-self-check" plugins/rock288/skills/cook` → SKILL.md + workflow-steps.md
- Mermaid parses; `SC` id unused before
