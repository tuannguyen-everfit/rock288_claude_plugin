# SPEC checklist

The SPEC is the contract of the loop. A link in the PR body proves nothing: the loop reads the SPEC, turns it into numbered items, and every later step answers to those items — the plan maps them, the tests prove them, the reviewers check them, the PR shows them.

## 1. Sources (step 0, after the hand-off links are settled)
Read in full, not the title:
- the request and the card: description, acceptance criteria, comments that change scope;
- the SPEC: Confluence → `getConfluencePage` (Atlassian MCP), Google Doc → `read_doc` / Drive, a Jira card → `getJiraIssue`, another URL → `WebFetch`;
- the Solution design, the same way: the API shape, field names, error codes and limits it fixes are items too.

A SPEC that covers more than this task: read it all, keep the parts this PR delivers as `in`, the rest as `out`.
Cannot read it (no access, image or Figma only, a dead link) → ask the human for the text or the access, also with `--recommend`. Never write items from a title or a guess.
SPEC `none` → the items come from the request and the card's AC; the file says `SPEC: none`.

## 2. Items
One item per checkable behavior: a rule, a value, a limit, a field and its type, an error code and message, a permission, a state change, an edge case the source names. Quote the source verbatim; split a sentence that holds two behaviors.

- `in` — this PR delivers it. Every `in` item gets a proof at step 3 / 4.
- `out: <why>` — another card, another repo, a later phase, already done on the base (`file:line`). An item moved out without one of these reasons is still `in`.

## 3. Ask before building (one round, also with `--recommend`)
These are facts only the human knows; a recommendation does not answer them:
- the SPEC, the card's AC, the SD and the current code disagree on a behavior this PR touches;
- an `in` item is ambiguous where the code must choose: a value, a limit, a field name or type, an error code, who may do it, what happens on empty / duplicate / missing input;
- the task asks for something the SPEC forbids, or the SPEC asks for something the task leaves out.

The answer goes under `## Answers` verbatim and settles the item. A detail the SPEC leaves open and no item depends on (a log message, an internal name) is not asked: follow the repo's convention and list it under `## Assumed`, so the reviewers see it.

## 4. File
Written with Bash (like the review brief: `.git/` paths can prompt in bypass mode) to `$(git rev-parse --path-format=absolute --git-path rk-trust/spec.md)`: outside the working tree, so the receipt stays valid and it is never committed. A new run writes it fresh; a resume or a `/rk:pr-follow-up` fix keeps it and appends.

```
# SPEC checklist — <ticket or one-line task>
SPEC: <url | none>   SD: <url | none>   Card: <key | none>

## Items
- S1 [in] "<verbatim quote>" — <SPEC §heading | SD §heading | AC #n | Request> — proof: <test name | runtime check | pending>
- S2 [out: <why>] "<verbatim quote>" — <source>

## Answers
- S3 — Q: <question> — Human: <answer verbatim>

## Assumed
- <detail the SPEC leaves open> → <what the code does, following file:line>
```

## 5. Where each step uses it
| Step | Rule |
|---|---|
| 2 Design | The plan maps every `in` item → file(s) + the test or runtime check that proves it. A design option that breaks an item is not an option. A plan change that drops or changes an item → ask the human. |
| 3 Implement | Every `in` item gets a red-on-old / green-on-new test, or a runtime check when no test can reach it. Put the item id in the test name or in its red / green line (`S2: ...`). Self-check row 9 runs against the `in` items. Code no item and no reach row asks for → remove it. |
| 4 Verify | Before the last verify, fill `proof:` on every `in` item. `pending` left → back to step 3. An item that cannot be proven here (needs another service, prod data, a device) → `Not verified` with the reason, never silently skipped. A test that shows the SPEC itself is wrong or impossible → stop and ask; do not bend the item to fit the code. |
| 5 Review | The brief carries the checklist verbatim. Reviewers judge the diff against the items, not against the story. A finding whose fix would change an item → `spec-conflict: yes` → the human. |
| 6–7 | The commit body lists the items proven; the PR body has the **SPEC coverage** table (`S<n>` · quote · proof · status), the `out` items with their reasons, the `## Answers` and `## Assumed` lines. |
| Follow-up | A review comment that changes an `in` item, or asks for an `out` one, is a product question → the human (`/rk:pr-follow-up` triage). A fix keeps every item green. |
