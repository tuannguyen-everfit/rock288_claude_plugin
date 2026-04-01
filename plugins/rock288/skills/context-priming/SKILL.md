---
name: rk:context-priming
description: "Systematic context priming for Claude Code sessions. Load project context, conventions, and constraints before starting work. Use at session start or before complex tasks."
argument-hint: "[focus area]"
---

# Context Priming

Systematically prime the conversation with relevant project context for better results.

## Quick Prime (Default)

When invoked without arguments, auto-detect and load:

1. **Project type** — Read package.json, Cargo.toml, go.mod, pyproject.toml, etc.
2. **CLAUDE.md** — Project rules and conventions
3. **Recent changes** — `git log --oneline -10` and `git diff --stat HEAD~3`
4. **Architecture** — Key directories and entry points
5. **Active work** — Current branch, uncommitted changes

## Focused Primes

### `/rk:context-priming api`
Load API context:
- Route definitions / endpoints
- Middleware stack
- Auth patterns
- Request/response types
- API documentation

### `/rk:context-priming frontend`
Load frontend context:
- Component tree / page structure
- State management setup
- Styling approach (CSS modules, Tailwind, etc.)
- Build configuration
- Key dependencies

### `/rk:context-priming database`
Load database context:
- Schema / migrations
- Models / entities
- Query patterns
- Indexes
- Connection configuration

### `/rk:context-priming testing`
Load testing context:
- Test framework and config
- Test directory structure
- Coverage reports
- CI test commands
- Fixtures and factories

### `/rk:context-priming deployment`
Load deployment context:
- CI/CD pipeline configuration
- Dockerfile / docker-compose
- Environment variables
- Infrastructure config (Terraform, K8s, etc.)
- Deployment scripts

## Priming Template

For each focus area, produce a concise context block:

```
## Context: [Area]

**Stack:** [key technologies]
**Patterns:** [architecture patterns used]
**Conventions:** [naming, file structure, coding style]
**Key Files:**
- [file] — [purpose]
- [file] — [purpose]

**Current State:**
- [recent relevant changes]
- [known issues or TODOs]

**Constraints:**
- [performance requirements]
- [security requirements]
- [compatibility requirements]
```

## Rules

- Keep context concise — only what's relevant to the upcoming work
- Prefer reading actual files over assumptions
- Note any inconsistencies found (these are often the source of bugs)
- Update mental model as you discover more context during work
