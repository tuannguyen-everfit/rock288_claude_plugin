# Phase 3 — Trust-loop pointer, bootstrap lines, version bump

Status: completed · Effort: ~15m · Depends on phases 1–2

## 1. `skills/trust-loop/SKILL.md`

- L43 → `- **Reach list**: per `../plan/references/reach-and-contracts.md` block 2 — every caller of changed behavior (grep, including files you would not otherwise touch), producers/consumers, other entry points, and the tests, fixtures, config and exports that must follow. That list is the scope; anything outside it is extra. A plan from step 2 already holds it: reuse its rows, add what step 1 finds.`
- L44 (Reach outside the repo): unchanged.
- L58 `it stops only on critical review issues left after 3 fixes` → `it stops only on Critical or Important review findings left after 3 fixes`.
- `metadata.version`: `1.15.1` → `1.15.2`.
- `references/review-round.md`: no change — `## Reach list (step 1)` format (`file:line per caller, test, fixture, config, export`) still fits block 2 rows.

## 2. `skills/bootstrap/references/`
- `workflow-auto.md:51`, `workflow-fast.md:47`: `Auto-approves if score≥9.5 and 0 critical issues` → `Auto-approves at 0 Critical + 0 Important review findings`.

## 3. Versions (same commit as phases 1–2)
- `plugins/rock288/.claude-plugin/plugin.json` `version`: `4.19.1` → `4.20.0`
- `.claude-plugin/marketplace.json` `plugins[0].version`: `4.19.1` → `4.20.0`

## Todo
- [x] trust-loop L43, L58, version
- [x] bootstrap 2 lines
- [x] both manifests 4.20.0

## Done when
- `grep -h '"version"' plugins/rock288/.claude-plugin/plugin.json .claude-plugin/marketplace.json` → both `4.20.0`
- `grep -rn "score≥9.5" plugins/rock288/skills/{cook,bootstrap,trust-loop}` → empty (fix/ intentionally untouched, D6)
- `node plugins/rock288/skills/trust-loop/scripts/verify-change.test.cjs` still passes (sanity, no script change)
- Commit: `feat(plan,cook): Reach & Contracts + pre-review self-check, review by Critical/Important, bump rk -> 4.20.0` — only when the user asks
