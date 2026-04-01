---
name: rk:spec-driven
description: "Spec-driven development using AB Method. Transform large problems into focused missions with clear specs. Use for breaking down complex features into implementable units."
argument-hint: "[feature or problem description]"
---

# Spec-Driven Development (AB Method)

Transform large, ambiguous problems into focused, spec-driven missions using subagents.

## Core Principle

> "A well-written spec is half the implementation."

Every feature starts as a spec. Specs are contracts between intent and implementation.

## Workflow

### Step 1: Problem Decomposition

Take the large problem and break it into **missions**:

```
PROBLEM: [Large feature/task]
│
├─ Mission A: [Focused, independent unit]
│   ├── Input: [What it receives]
│   ├── Output: [What it produces]
│   └── Constraints: [Rules and limits]
│
├─ Mission B: [Another focused unit]
│   ├── Input: [What it receives]
│   ├── Output: [What it produces]
│   └── Constraints: [Rules and limits]
│
└─ Mission C: [Integration unit]
    ├── Dependencies: [A, B]
    ├── Input: [Outputs from A and B]
    └── Output: [Final result]
```

### Step 2: Write Specs

For each mission, write a precise spec:

```markdown
# Spec: [Mission Name]

## Goal
[One sentence describing what this achieves]

## Input
- [parameter]: [type] — [description]

## Output
- [return]: [type] — [description]

## Behavior
1. When [condition], then [action]
2. When [edge case], then [handling]
3. When [error], then [recovery]

## Constraints
- [Performance requirement]
- [Security requirement]
- [Compatibility requirement]

## Test Cases
| Input | Expected Output | Notes |
|-------|----------------|-------|
| [case 1] | [expected] | Happy path |
| [case 2] | [expected] | Edge case |
| [case 3] | [error] | Error case |
```

### Step 3: Validate Specs

Before implementation:
- [ ] Each spec is independently implementable
- [ ] No circular dependencies between missions
- [ ] All edge cases identified
- [ ] Test cases cover happy path + errors
- [ ] Specs are consistent with each other

### Step 4: Execute Missions

For each mission:
1. Implement according to spec
2. Write tests matching spec test cases
3. Verify all constraints met
4. Document any spec deviations

### Step 5: Integration

Combine missions following the dependency graph:
1. Start with independent missions (no dependencies)
2. Integrate dependent missions in order
3. Run integration tests
4. Verify overall behavior matches original problem

## Rules

- Never start coding without a spec
- Specs should be reviewable by non-engineers
- If implementation diverges from spec, update the spec first
- Each mission should be completable in one focused session
- Prefer small, precise missions over large, vague ones
