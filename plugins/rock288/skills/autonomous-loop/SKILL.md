---
name: rk:autonomous-loop
description: "Run autonomous task completion loop with safety guardrails. Keeps working until task is done or blocked. Use for complex multi-step tasks that need persistent iteration."
argument-hint: "[task description]"
---

# Autonomous Loop (Ralph Technique)

Autonomous task completion with intelligent exit detection and safety guardrails.

## Core Loop

```
LOOP:
  1. Assess current state
  2. Determine next action
  3. Execute action
  4. Verify result
  5. Check exit conditions
  → If not done: GOTO 1
  → If done: EXIT with summary
  → If blocked: EXIT with blocker description
```

## Workflow

### Step 1: Task Analysis

Before entering the loop:
1. Understand the full scope of the task
2. Define clear success criteria
3. Identify potential blockers
4. Set maximum iteration limit (default: 20)

### Step 2: Enter Loop

For each iteration:

1. **State Assessment** — What is the current state? What changed since last iteration?
2. **Plan Next Action** — What is the single most impactful action right now?
3. **Execute** — Take the action (edit, run, test, etc.)
4. **Verify** — Did it work? Check output, run tests, verify behavior
5. **Log Progress** — Record what was done and the result

### Step 3: Exit Conditions

Exit the loop when ANY of these are true:

| Condition | Action |
|-----------|--------|
| ✅ Task complete | Verify success criteria met, exit with summary |
| 🔴 Blocked | Cannot proceed without user input, exit with blocker |
| 🟡 Max iterations | Hit limit, exit with progress report |
| ⚠️ Unsafe state | About to do something destructive, exit and ask |
| 🔄 Circular | Same error 3+ times, exit with analysis |

### Step 4: Summary Report

On exit, provide:
```
## Autonomous Loop Report

**Status:** ✅ Complete | 🔴 Blocked | 🟡 Partial
**Iterations:** X / max
**Task:** [description]

### Actions Taken
1. [action] → [result]
2. [action] → [result]
...

### Result
[What was accomplished]

### Remaining (if any)
- [What still needs to be done]
```

## Safety Guardrails

1. **Never** push to remote without explicit permission
2. **Never** delete files/branches without asking
3. **Never** modify production configs
4. **Pause** if tests fail 3 times in a row — analyze before retrying
5. **Pause** if making changes outside the expected scope
6. **Always** verify before claiming completion

## Tips

- Break large tasks into phases, complete one phase per loop
- Use git commits as checkpoints between major changes
- If stuck, try a different approach rather than repeating the same one
- Keep each iteration focused — one action per iteration
