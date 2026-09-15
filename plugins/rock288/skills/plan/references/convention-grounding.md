# Convention Grounding

Run BEFORE writing the first plan file. A plan does not merely describe behaviour — it **freezes convention decisions** that `/rk:cook` then implements verbatim. Cook's Convention Pre-flight can only catch what the plan left open; it cannot catch a convention decision the plan made *wrongly and confidently*.

## Why this exists

Real miss (everfit-api, UP-78706): the plan decided a user-facing **403 would carry no `localization_code`**, reasoning "the email guard three lines above doesn't have one either". The team's own coding-style doc says localization is preferred for user-facing errors. The neighbour was simply older than the standard. The plan had to be rewritten after the fact — and had it gone straight to cook, the miss would have shipped as an explicit, documented decision nobody would revisit.

Two more from the same plan: a `&&` chain where the team standard says `_.get`, and a new helper whose shape (sync vs wrapped) was left unstated in a module that contains **both** shapes.

**The part that matters:** both rules were in the repo the whole time — in `.cursor/rules/coding-standards.mdc` (29 KB; 21 hits for `localization_code`, one of them a literal `❌ missing localization_code` / `✅ Do this instead` pair; a whole `Use Lodash for Common Operations` section). The repo's `CLAUDE.md` never mentions `.cursor`, so nothing opened it. **A team's richest style guide usually lives in another tool's agent-rule file, and it is invisible unless you go looking.**

## Precedence — this is the rule that gets it wrong

```
documented standard  >  nearest sibling precedent  >  the file you are editing
```

1. **Documented standard wins over any neighbour.** Repo `CLAUDE.md`, `docs/code-standards*`, and any team style guide the user hands you. A neighbouring line that disagrees is evidence the neighbour is old, not evidence the standard is optional.
2. **Sibling precedent wins over invention.** Where the standard is silent, copy the nearest mature sibling module — and name which sibling in the plan.
3. **Consistency inside one file wins over cosmetic standard preferences.** If a legacy file imports `Error` and the standard spells it `errorsCodes` for the *same* object, don't import a second alias for one new line. Record it as a deliberate deviation with the reason.

Deviations are fine. **Silent** deviations are not: every one goes in the plan as a row with its reason, so review argues with a decision instead of discovering a mistake.

## Grounding sources (read them, don't assume)

| Source | How to get it | Note |
|--------|---------------|------|
| Repo `CLAUDE.md` | `Read` it explicitly | A subagent or headless run may not have it injected — never assume it is in context |
| `docs/code-standards*`, `docs/development-rules.md` | Read if present | |
| **Agent-rule files from OTHER tools** | `ls .cursor/rules/ .github/instructions/ 2>/dev/null; ls .cursorrules .windsurfrules AGENTS.md CONVENTIONS.md 2>/dev/null` | **Run this every time.** Cursor `.mdc` rules, Copilot instructions and `AGENTS.md` are frequently the LONGEST and most current style source in a repo, and `CLAUDE.md` rarely links them. Grep them for the specific idioms your plan is about to decide (error envelope, utility lib, layer placement) rather than reading 30 KB end to end |
| **Team style guide outside the repo** | Ask the user for it if the repo references one, or if the user mentions a style doc / review thread | Often a Slack-shared `coding-style.md` or a wiki page — it is usually **newer than the repo docs** |
| Nearest sibling module | `ls` the target module and one mature sibling side by side | Every folder the sibling has that you are not using is an unmade placement decision |
| Recent review threads on the same area | User-supplied PR/Slack links | Reviewer comments are the standard's real enforcement surface |

When a team style guide is used, record its **identity and date** in the plan ("`coding-style.md`, shared 2026-09-14") — a plan that cites a guide nobody can locate is unreviewable.

## Checklist — resolve each, or say why it does not apply

| # | Question | Wrong (real finding) | Right |
|---|----------|----------------------|-------|
| 1 | **Error envelope** — what must every error response carry? | New 403 with no `localization_code`, justified by an older neighbour that has none | Mint or reuse a key now; put it in the domain config file beside its siblings |
| 2 | **Utility idiom** — does the project mandate a utility library over language builtins? | `a && a.b` / `a?.b` where the standard says `_.get(a, 'b', default)` | Follow the stated idiom even when the builtin is shorter |
| 3 | **Where does a small function live?** | Helper written inline in a service | Module `helpers/` (or the layer the project reserves), exported through the delegator |
| 4 | **Which shape does that layer use here?** | Module contains both `funcWrap` async helpers and plain sync ones; plan says neither | Name the precedent file the new one copies ("sync, like `helpers/x`; `funcWrap` is for I/O helpers like `helpers/y`") |
| 5 | **Constants / lookup tables** | Literals and reason-strings declared at the top of a service | Domain file under the project's config dir |
| 6 | **Query-shape rules** | Non-`_id` query without the tenant/team key | Include it, or state the documented exception the data model relies on |
| 7 | **Caching** | In-memory memo in a multi-pod deployment | Shared store, or no cache — and say which, with the pod count as the reason |
| 8 | **Defensive ceremony** | `try/catch` around a read whose failure should bubble | Straight-line code; reviewers read extra ceremony as noise |
| 9 | **Layer placement / module isolation** | Cross-module model import in a repository | Own model only; cross-module data through the other module's service |
| 10 | **Docs & API contract** | Endpoint or payload shape changed with no doc change | Doc change named in the plan, with its repo and whether it is a separate PR |

Rows 1–8 are the ones plans get wrong; 9–10 overlap `/rk:cook`'s pre-flight and are cheap to re-assert here.

## What must land in the plan

1. A **Convention Compliance** table in `plan.md`: `rule → where it is applied in this plan`. One row per rule that actually bites; do not pad it with rules the change never touches.
2. A **Deliberate deviations** block: rule · what the plan does instead · why. Empty is a valid answer — say "none" rather than omitting the block.
3. Convention decisions that changed a design choice get a row in the plan's decisions table (e.g. `D6 | localization_code on the 403 | Yes — style guide §5 beats the older neighbour`), not just a footnote.
4. Code snippets inside phase files are written **already conforming** — cook copies them literally.

## Anti-rationalization

| Thought | Reality |
|---------|---------|
| "The neighbouring line does it this way" | That is how old code stays old. Check the standard's date against the neighbour's. |
| "It's one line, the idiom doesn't matter" | The idiom is the cheapest review comment to earn and the cheapest to avoid. |
| "Cook will catch it at implementation" | Cook implements what the plan decided. A wrong decision in the plan reads as intent. |
| "The style guide is not in the repo, so it isn't binding" | It is binding if the team reviews with it. Ask for it, cite it, date it. |
| "`CLAUDE.md` didn't mention any style doc, so there isn't one" | `CLAUDE.md` is one tool's entry point, not an index of the repo. `ls .cursor/rules/` costs one call and has already caught two shipped misses. |
| "I'll note the deviation in the PR description" | The plan is where reviewers look for intent. A deviation discovered in the diff reads as an accident. |
