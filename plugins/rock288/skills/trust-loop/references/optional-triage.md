# Optional findings — fix or keep

An `[Optional]` (Nice-to-have) finding — from a review round, a PR review or a Slack reply — is **fixed** when any of these holds. It is decided per finding, never in bulk.

| # | Fix when | Example |
|---|---|---|
| 1 | **Written rule.** It cites a rule the diff breaks: `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*`, `.cursor/rules/*`, lint config. | a history note in a code comment against "comments explain the current WHY" |
| 2 | **Wrong statement.** A comment, doc line, test name, log message or error text the diff adds or touches says something the code does not do. | a comment naming one account type when the guard covers every ever-isolated row; a test named "unknown phone" that asserts "no phone" |
| 3 | **Hidden failure.** A test or smoke step the diff adds can pass wrongly, skip silently, or fail without naming the real cause. | `t.Run("")` reported as `#00`; an empty id that makes every later step fail as a cascade |
| 4 | **Stale trace.** A doc the change made outdated, inside this repo: a test-case trace row, a README, a design line. | the R27 row not listing the new smoke steps |
| 5 | **Readability with a named cost** on lines the diff adds: the reviewer says what a reader has to work out, and the fix keeps the behavior. | "readers have to trace three cases" → one named flag |

**Keep** it, with the reason in the PR and the report, when:
- it targets code the diff does not add or change;
- it needs another repo or team (raise it with them; list it under "Outside this repo");
- it would change the SPEC — then it is not optional: treat it like a `[Must fix]` with `spec-conflict: yes` and ask the human;
- it is taste with no concrete cost, or a refactor bigger than the change itself.

How a fix runs:
- In the change's own files, with no new behavior. A fix that needs a new test is not optional: it is a missed behavior → `[Must fix]`.
- Same path as a `[Must fix]`: step 4 (the receipt is stale) → a new review round.
- Reported again after it was fixed → keep it, reason `fixed in round <n>, reported again` (never `BLOCKED` for an optional).
- Round 5 ends with fixable optionals → keep them, reason `round cap`: a fix after round 5 would ship unreviewed.
