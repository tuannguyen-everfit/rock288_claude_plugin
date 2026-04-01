---
name: rk:review-pr
description: "Review a pull request on GitHub. Analyze diff, check code quality, security, performance, and provide actionable feedback. Use when reviewing PRs before merge."
argument-hint: "[PR number or URL]"
---

# Pull Request Review

Comprehensive PR review with actionable feedback.

## Workflow

### Step 1: Fetch PR Details

```bash
# If PR number provided
gh pr view <NUMBER> --json title,body,author,baseRefName,headRefName,additions,deletions,changedFiles,files
gh pr diff <NUMBER>

# If no number, list open PRs
gh pr list --state open
```

### Step 2: Analyze the Diff

Review every changed file for:

| Category | Check |
|----------|-------|
| **Correctness** | Logic errors, edge cases, off-by-one, null handling |
| **Security** | Injection, XSS, SSRF, secrets in code, auth bypasses |
| **Performance** | N+1 queries, unnecessary re-renders, missing indexes |
| **Code Quality** | DRY, SOLID, naming, dead code, complexity |
| **Tests** | Missing tests for new logic, test quality, coverage |
| **Breaking Changes** | API changes, schema changes, dependency bumps |

### Step 3: Check CI Status

```bash
gh pr checks <NUMBER>
```

### Step 4: Provide Review

Structure your review as:

```
## Summary
One paragraph overview of what the PR does.

## Verdict: ✅ APPROVE | 🔶 REQUEST CHANGES | ❌ BLOCK

## Issues Found

### 🔴 Critical (must fix)
- [file:line] Description and suggested fix

### 🟡 Important (should fix)
- [file:line] Description and suggested fix

### 🔵 Suggestions (nice to have)
- [file:line] Description and suggested fix

## What's Good
- Positive observations
```

### Step 5: Submit Review (if requested)

```bash
gh pr review <NUMBER> --approve --body "..."
# or
gh pr review <NUMBER> --request-changes --body "..."
# or
gh pr review <NUMBER> --comment --body "..."
```

## Rules

- NEVER auto-approve without thorough review
- Always check for security implications
- Be specific — reference file and line numbers
- Suggest concrete fixes, not vague feedback
- If PR is too large (>500 lines), suggest splitting
