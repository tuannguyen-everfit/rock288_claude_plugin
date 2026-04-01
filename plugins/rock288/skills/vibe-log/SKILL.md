---
name: rk:vibe-log
description: "Analyze prompts and session activity for intelligent session analysis and strategic guidance. Review what happened, what worked, and plan next steps. Use at end of session or for reflection."
argument-hint: "[session topic or 'analyze']"
---

# Vibe Log

Session analysis and strategic guidance.

## Workflow

### Step 1: Gather Session Data

Collect information about the current session:

```bash
# Recent git activity
git log --oneline --since="today" --author="$(git config user.name)" 2>/dev/null || git log --oneline -20

# Files changed
git diff --stat HEAD~5 2>/dev/null || git diff --stat

# Current branch context
git branch --show-current
git status --short
```

### Step 2: Session Analysis

Analyze the session across these dimensions:

```
## Session Vibe Check

### 📊 Productivity
- **Files changed:** [count]
- **Lines added/removed:** [+X / -Y]
- **Commits:** [count]
- **Tasks completed:** [list]

### 🎯 Focus Score: [1-10]
- Were we focused on one thing or scattered?
- Did scope creep happen?
- Were there unnecessary tangents?

### 🔄 Iteration Quality: [1-10]
- How many times did we retry the same approach?
- Did we course-correct quickly when stuck?
- Were solutions clean or hacky?

### 💡 Decision Quality
- **Good decisions:** [what went well]
- **Questionable decisions:** [what could be better]
- **Deferred decisions:** [what was postponed]

### 🚧 Blockers Encountered
- [Blocker 1] — [how resolved or still blocking]
- [Blocker 2] — [how resolved or still blocking]
```

### Step 3: Strategic Guidance

Based on the analysis, provide:

```
## Next Steps

### Immediate (next session)
1. [Most important task]
2. [Second priority]
3. [Third priority]

### This Week
- [Goal 1]
- [Goal 2]

### Watch Out For
- [Potential risk or tech debt]
- [Deferred decision that needs attention]

### Suggestions
- [Process improvement]
- [Tool or approach to try]
```

### Step 4: Save Log

Create a log entry:

```markdown
## Vibe Log — [Date]

**Branch:** [branch]
**Focus:** [what we worked on]
**Vibe:** [emoji + one word: 🔥 Productive | 😤 Frustrating | 🎉 Breakthrough | 🐌 Slow]

### Accomplished
- [task 1]
- [task 2]

### Learned
- [insight 1]
- [insight 2]

### Tomorrow
- [priority 1]
- [priority 2]
```

## Rules

- Be honest — vibe logs are for reflection, not performance review
- Focus on patterns, not individual events
- Suggest process improvements, not just task lists
- Keep it brief — a vibe log should take 2 minutes to read
