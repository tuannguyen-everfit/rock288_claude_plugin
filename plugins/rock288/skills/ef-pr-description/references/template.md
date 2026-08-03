# PR Description Template (Everfit house style)

Reference: PR https://github.com/Everfit-io/everfit-api/pull/16944 (read-time library-item overlay, UP-71331).

## Title

```
<type>(<scope>): <CARD-ID> <one-line summary>
```

- `<type>`: `feat` | `fix` | `refactor` | `perf` | `chore` | `docs` | `test`
- `<scope>`: kebab-case subsystem name, e.g. `video-workout`, `assignment`, `payment`
- `<CARD-ID>`: Jira key, e.g. `UP-71331`
- summary: verb-led, ≤ 60 chars after the prefix

Example:
```
feat(video-workout): UP-71331 read-time library-item overlay
```

## Body skeleton

```markdown
## Summary

<1–3 sentences. Lead with the verb. State the *behavior change*, not the file moves.
Reference the new pattern vs. the old one when applicable.>

**Ticket:** <CARD-ID>[ (parent epic: <PARENT-CARD-ID>)]
**Plan:** [`<plan-doc-path>`](<plan-doc-url>)
**Solution design:** [`<sd-path>`](<sd-url>)

## <Optional invariant / scope-guard section>

> <Quote the iron-law that bounds the change, if any.>

<Explanation of how every entry point honours the guard. Link to a regression test
that verifies it.>

## What changed

### Schema
- <field>/collection: <one-line reason>

### New helpers (`<module-path>/helpers/`)
- `<helper-name>` — <one-line purpose, including any scope guard>.

### New service
- `<module-path>/services/<service-name>` — <when invoked, what it does>.

### Read sites wired (<N> endpoints)
| Endpoint | Module |
|---|---|
| `<METHOD> <path>` | `<module-or-controller-path>` |
| ... | ... |

### <Behavior section: Track / Swap / Migration / etc.>
- `<METHOD> <path>` — <change>.
- `<METHOD> <path>` — returns **<status>** with `<error-code>` when `<condition>`.

### Out of scope (per design §<N>)
- `<path>` — <why intentionally untouched>.

## Test plan

- [x] **Unit tests:** <N> passing across <module list>
- [x] **E2E tests:** <list of e2e modules>
- [x] **<Special regression sweep>** — <N>/<N> — <what it asserts>
- [ ] **<Deferred item>** — <where it will run, why deferred>.
- [ ] **Smoke checklist** (<N> items, see [`<smoke-doc-path>`](<smoke-doc-url>)) — to run on staging.

## Self-review summary

[`<self-review-path>`](<self-review-url>) (not committed, generated locally)

- **<N> blockers**
- **<N> warnings:**
  - <ID>: <one-line>.
- **<N> nits:** <one-line list>.

## Rollout

<Feature flag status: none / behind flag X. If none, restate the scope guard.>

**Rollback:** <how to revert. What orphan state remains and whether it is harmless.>
```

## Section rules

- **Summary**: verb-first, present tense. State the *behavior change* in user/system terms, not "added file X".
- **Ticket / Plan / Solution design**: only include lines for artifacts that actually exist. Don't fabricate a plan link.
- **Iron-law / scope-guard**: include only when the PR introduces a contract the reviewer must check (e.g. "applies only when type === 'video'"). Quote the contract in a blockquote, then explain how every entry point honours it.
- **What changed**: group by *kind of change* (schema vs helpers vs services vs endpoints), not by file. Inside each subsection, lead each bullet with the symbol name in backticks.
- **Tables**: prefer for endpoint lists ≥ 4 rows. Otherwise use bullets.
- **Out of scope**: name files/flows that a reviewer might *expect* to be touched, and say why they were not.
- **Test plan**: `[x]` only for tests that actually ran green. `[ ]` for anything deferred. Quote concrete numbers (e.g. "523 passing") if known.
- **Self-review summary**: optional. Useful when blockers/warnings/nits were tracked separately by another agent or tool.
- **Rollout**: always state feature-flag status. If none, link back to the scope guard. Always include rollback semantics and orphan-data implications.

## Tone

- Terse, technical, factual.
- Past tense for what was done, present tense for what the system now does.
- Concrete file paths and symbol names, in backticks.
- Never marketing language.
- Numbers, not adjectives ("523 tests" > "comprehensive tests").
