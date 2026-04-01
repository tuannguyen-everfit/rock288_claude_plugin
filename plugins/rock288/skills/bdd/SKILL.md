---
name: rk:bdd
description: "Behavior-Driven Development with Gherkin specs. Write scenarios first, then implement. Use for feature development with clear acceptance criteria."
argument-hint: "[feature or user story]"
---

# Behavior-Driven Development

Write behavior specifications first, then implement to make them pass.

## Workflow

### Step 1: Write User Story

```
As a [role]
I want [feature]
So that [benefit]
```

### Step 2: Write Gherkin Scenarios

For each behavior, write a scenario:

```gherkin
Feature: [Feature name]
  [Optional description]

  Scenario: [Happy path]
    Given [initial context]
    And [additional context]
    When [action taken]
    Then [expected outcome]
    And [additional outcome]

  Scenario: [Edge case]
    Given [context]
    When [action]
    Then [outcome]

  Scenario: [Error case]
    Given [context]
    When [invalid action]
    Then [error handling]
```

### Step 3: Scenario Coverage Checklist

For each feature, ensure coverage:

- [ ] Happy path (normal usage)
- [ ] Edge cases (boundaries, empty, max)
- [ ] Error cases (invalid input, network failure)
- [ ] Authorization (wrong role, unauthenticated)
- [ ] Concurrency (simultaneous actions)
- [ ] State transitions (from each valid state)

### Step 4: Implement Step Definitions

Map Gherkin steps to test code:

**JavaScript (Cucumber.js):**
```javascript
const { Given, When, Then } = require('@cucumber/cucumber');

Given('the user is logged in', async function() {
  this.user = await login(testUser);
});

When('they submit the form', async function() {
  this.result = await submitForm(this.user, formData);
});

Then('the record is created', async function() {
  assert(this.result.success);
});
```

**Python (Behave):**
```python
from behave import given, when, then

@given('the user is logged in')
def step_login(context):
    context.user = login(test_user)

@when('they submit the form')
def step_submit(context):
    context.result = submit_form(context.user, form_data)

@then('the record is created')
def step_verify(context):
    assert context.result.success
```

### Step 5: Red → Green → Refactor

1. **Red** — Run scenarios, verify they fail (not yet implemented)
2. **Green** — Implement the minimum code to pass all scenarios
3. **Refactor** — Clean up while keeping all scenarios green

### Step 6: Living Documentation

Gherkin scenarios serve as living documentation:
- Always keep scenarios up to date with implementation
- Use scenarios in code review to verify behavior
- Generate reports from test runs for stakeholders

## BDD Tools

| Language | Tool | Runner |
|----------|------|--------|
| JavaScript | Cucumber.js | `npx cucumber-js` |
| TypeScript | Cucumber.js + ts-node | `npx cucumber-js --require-module ts-node/register` |
| Python | Behave | `behave` |
| Python | pytest-bdd | `pytest` |
| Ruby | Cucumber | `cucumber` |
| Go | Godog | `godog` |
| Java | Cucumber-JVM | `mvn test` |
