---
name: rk:learn-from-mistakes
description: "Compound engineering — learn from past mistakes and failures. Analyze what went wrong, extract lessons, and create guardrails. Use after incidents, failed approaches, or repeated errors."
argument-hint: "[describe what went wrong]"
---

# Learn From Mistakes (Compound Engineering)

Turn failures into systematic improvements. Every mistake is a learning opportunity that compounds over time.

## Workflow

### Step 1: Incident Capture

Document what happened:

```markdown
## Incident: [Short title]
**Date:** [date]
**Severity:** 🔴 Critical | 🟡 Major | 🔵 Minor
**Area:** [code area / system / process]

### What Happened
[Factual description — no blame, no judgment]

### What Was Expected
[What should have happened instead]

### Impact
[What was affected — users, data, timeline]
```

### Step 2: Root Cause Analysis (5 Whys)

```
Why did [the problem] happen?
→ Because [cause 1]

Why did [cause 1] happen?
→ Because [cause 2]

Why did [cause 2] happen?
→ Because [cause 3]

Why did [cause 3] happen?
→ Because [cause 4]

Why did [cause 4] happen?
→ Because [ROOT CAUSE]
```

### Step 3: Extract Lessons

For each lesson learned:

```markdown
### Lesson: [Title]

**Context:** When [situation]
**Mistake:** We [what we did wrong]
**Root Cause:** Because [why]
**Fix:** Instead, [what to do]
**Guardrail:** [How to prevent this automatically]
```

### Step 4: Create Guardrails

Turn lessons into automated prevention:

| Type | Implementation |
|------|---------------|
| **Lint rule** | ESLint/Prettier rule to catch the pattern |
| **Test** | Regression test for this specific failure |
| **Pre-commit hook** | Check before code is committed |
| **CI check** | Automated verification in pipeline |
| **Code review checklist** | Add to review checklist |
| **CLAUDE.md rule** | Add to project rules for AI assistance |
| **Type constraint** | TypeScript type that prevents the error |

### Step 5: Update Knowledge Base

Save the lesson where it will be found:
1. Add to project's `LESSONS.md` or similar file
2. Update CLAUDE.md with relevant rules
3. Add regression tests
4. Update documentation if process needs changing

## Anti-Patterns to Avoid

| Anti-Pattern | Instead |
|-------------|---------|
| Blaming individuals | Focus on systems and processes |
| Vague lessons ("be more careful") | Specific, actionable guardrails |
| One-time fixes | Automated prevention |
| Ignoring near-misses | Treat them as real incidents |
| Over-engineering prevention | Proportional response to severity |

## Template: Lessons File

Create `LESSONS.md` in project root if it doesn't exist:

```markdown
# Lessons Learned

## [Category]

### [Date] — [Title]
**What:** [brief description]
**Why:** [root cause]
**Fix:** [what we changed]
**Guardrail:** [how we prevent recurrence]
```
