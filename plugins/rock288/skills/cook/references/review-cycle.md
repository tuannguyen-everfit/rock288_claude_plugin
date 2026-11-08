# Code Review Cycle

Interactive review-fix cycle used in code workflows.

Reviewer returns findings in `/rk:code-review` buckets: `critical[]`, `important[]`, `nice[]`. `must_fix = critical + important`.

Reviewer used High / Medium / Low instead (`agents/code-reviewer.md` template) → High = Important; Medium = Important if it names a concrete case, else Nice-to-have; Low = Nice-to-have.

## Interactive Cycle (max 3 cycles)

```
cycle = 0
LOOP:
  1. Run code-reviewer → critical[], important[], nice[]
     must_fix = critical + important

  2. DISPLAY FINDINGS:
     ┌─────────────────────────────────────────┐
     │ Code Review Results                     │
     ├─────────────────────────────────────────┤
     │ Summary: [what implemented], tests      │
     │ [X/X passed]                            │
     ├─────────────────────────────────────────┤
     │ Critical ([N]): MUST FIX                │
     │  - [issue] at [file:line]               │
     │ Important ([N]): MUST FIX               │
     │  - [issue] at [file:line]               │
     │ Nice-to-have ([N])                      │
     │  - [suggestion]                         │
     └─────────────────────────────────────────┘

  3. AskUserQuestion (header: "Review & Approve"):
     IF must_fix > 0:
       - "Fix must-fix issues" → fix, re-run tester, cycle++, LOOP
       - "Fix all issues" → fix all, re-run tester, cycle++, LOOP
       - "Approve anyway" → PROCEED
       - "Abort" → stop
     ELSE:
       - "Approve" → PROCEED
       - "Fix nice-to-have" → fix, cycle++, LOOP
       - "Abort" → stop

  4. IF cycle >= 3 AND user selects fix:
     → "⚠ 3 review cycles completed. Final decision required."
     → AskUserQuestion: "Approve with noted issues" / "Abort workflow"
```

## Auto-Handling Cycle (for auto modes)

```
cycle = 0
LOOP:
  1. Run code-reviewer → critical[], important[], nice[]
     must_fix = critical + important

  2. IF must_fix == 0:
     → Auto-approve (log nice-to-have), PROCEED

  3. ELSE IF cycle < 3:
     → Auto-fix must_fix
     → Re-run tester
     → cycle++, LOOP

  4. ELSE:
     → ESCALATE TO USER
```

## Severity
- **Critical:** breaks or is exploitable on a shipped path (crash, data loss, auth bypass, dangling name that throws).
- **Important:** wrong result for a concrete input, written-rule violation, reach-list site not updated, risky branch untested.
- **Nice-to-have:** everything else.

A finding without a concrete case is dropped, not downgraded.

## Output Formats
- Waiting: `⏸ Step 5: [C] Critical / [I] Important / [N] Nice-to-have - WAITING for approval`
- After fix: `✓ Step 5: [N] must-fix → Fixed → 0 - Approved`
- Auto-approved: `✓ Step 5: 0 Critical / 0 Important / 2 Nice-to-have - Auto-approved`
- Approved: `✓ Step 5: [C] Critical / [I] Important / [N] Nice-to-have - User approved`
