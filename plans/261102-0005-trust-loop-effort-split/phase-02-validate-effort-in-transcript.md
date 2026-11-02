---
phase: 2
title: "Validate in a real loop"
status: pending
effort: 20m
---

# Phase 2 — Validate in a real loop

Prereq: phase 1 committed + pushed (human asks), then refresh installed plugin (CLAUDE.md one-liner) and restart Claude Code. Installed version must read 4.14.0.

## Steps
1. Run `/rk:trust-loop` on a small multi-file task in a scratch repo (forces step 2 plan + step 5 review).
2. Find the session transcript: `~/.claude/projects/<cwd-slug>/<session>.jsonl` (+ subagent transcripts).
3. Grep effort per request:
   ```bash
   grep -o '"effort":"[a-z]*"' <main>.jsonl | sort | uniq -c
   grep -o '"effort":"[a-z]*"' <subagent>.jsonl | sort | uniq -c
   ```
4. Expect: main session requests during the loop = `medium`; planner + code-reviewer subagents = `high`.

## Outcomes
- Pass → done; record result in plan.md.
- Main session not `medium` (skill effort not held across nested skills) → remove `effort: medium` from trust-loop frontmatter, replace with a line telling the human to run `/effort medium` before the loop; patch bump.
- Subagents not `high` → the flag was not threaded; strengthen wording in plan/code-review, patch bump.

## Follow-up metric
Over the next 5–10 loops compare report `Review: <n> rounds · fixed <k>` vs before. Rounds rising noticeably → reconsider medium coding.
