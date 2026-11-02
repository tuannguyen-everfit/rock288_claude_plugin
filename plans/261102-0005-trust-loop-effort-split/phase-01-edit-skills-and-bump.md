---
phase: 1
title: "Edit skills + bump"
status: completed
effort: 40m
---

# Phase 1 — Edit skills + bump

All paths under `plugins/rock288/`. Targeted edits; do not reformat surrounding text.

## 1. `skills/plan/SKILL.md`
- `argument-hint`: `"[task] [--recommend] [--effort=<level>] OR [archive|red-team|validate]"`
- `metadata.version`: `1.3.0` → `1.4.0`
- After the `--recommend` paragraph (Workflow Modes), add:
  > Add `--effort=<level>` (`low|medium|high|max`; passed by `/rk:trust-loop` as `--effort=high`) to spawn the `planner` subagent with the Agent tool param `effort: "<level>"`. Without it, spawn as before (no `effort` param).

## 2. `skills/code-review/SKILL.md`
- `argument-hint`: `"[#PR | COMMIT | --pending | codebase [parallel]] [--effort=<level>]"`
- `metadata.version`: `2.0.3` → `2.1.0`
- Below the input-mode table, add an **Effort** note:
  > `--effort=<level>` (passed by `/rk:trust-loop` as `--effort=high`): every `code-reviewer` subagent this run spawns — Stage 2, Stage 3 adversarial, parallel scopes — gets the Agent tool param `effort: "<level>"`. A spec or intent questions given with the invocation go into the Stage 2 subagent prompt; each unmet requirement or "no" answer comes back as an Important finding. Without the flag, spawn as before.

## 3. `skills/code-review/references/adversarial-review.md`
- §1 "Spawn Adversarial Reviewer": after "Dispatch `code-reviewer` subagent with adversarial prompt:" add one line: `With --effort=<level>, pass effort: "<level>" on this spawn too.`

## 4. `skills/trust-loop/SKILL.md`
- Frontmatter: add `effort: medium` (top level, after `argument-hint`); `metadata.version` `1.10.1` → `1.11.0`
- After the `--recommend` paragraph, add:
  > **Effort**: the loop itself runs at `medium` (frontmatter): intake, coding, verify. Judgement runs at `high` in subagents: `/rk:plan --effort=high` (planner) and `/rk:code-review --effort=high` (every reviewer, including the intent check).
- Step 2, multi-file bullet: `/rk:plan` (`--effort=high`; `--recommend` when this loop has it)
- Step 5 round list:
  - item 1 → `/rk:code-review --pending --effort=high` on the **whole** diff against the base (adversarial pass + the repo's written conventions), with the original request, the step 1 reach list and the intent check below as its spec — the high-effort reviewer answers the intent check, not the main session. Every round reviews everything again; no fix-diff-only re-review.
  - drop item 2 ("The intent check below.") and renumber 3–6 → 2–5 (fix the internal "→ step 6" ref only if it points to an item number; it points to section 6, keep)
  - Intent check intro: "Intent check, answered by the reviewer against the original request (not the plan); a "no" is a must-fix:"

## 5. Manifests
- `.claude-plugin/plugin.json` `version` → `4.14.0`
- `../../.claude-plugin/marketplace.json` `plugins[0].version` → `4.14.0`

## Done when
- `grep -n "effort" ` on the 4 skill files shows the edits; both manifests read `4.14.0`
- `git diff --stat` touches exactly 6 files
- Frontmatter of the 3 skills still parses (`python3 -c "import yaml,sys; ..."` on the `---` block)
