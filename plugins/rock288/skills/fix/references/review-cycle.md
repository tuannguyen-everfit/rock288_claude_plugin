# Review Cycle

Mode-aware review handling for code-reviewer results.

Reviewer prompt: "Review the fix for [issue] per /rk:code-review. Report findings as Critical / Important / Nice-to-have; each bug/risk finding names a concrete input and the wrong result (finding gate)."

Reviewer returns `critical[]`, `important[]`, `nice[]`. `must_fix = critical + important`. Reviewer used High / Medium / Low instead (`agents/code-reviewer.md` template) → High = Important; Medium = Important if it names a concrete case, else Nice-to-have; Low = Nice-to-have.

## Autonomous Mode

```
cycle = 0
LOOP:
  1. Run code-reviewer → critical[], important[], nice[]

  2. IF must_fix == 0:
     → Output: "✓ Review 0 Critical / 0 Important / [N] Nice-to-have - Auto-approved"
     → PROCEED to next step (nice-to-have logged, not blocking)

  3. ELSE IF cycle < 3:
     → Output: "⚙ Auto-fixing [N] must-fix findings (cycle [cycle+1]/3)"
     → Fix Critical + Important
     → Re-run tests
     → cycle++, GOTO LOOP

  4. ELSE:
     → ESCALATE to user via AskUserQuestion
     → Display findings
     → Options: "Fix manually" / "Approve anyway" / "Abort"
```

## Human-in-the-Loop Mode

```
ALWAYS:
  1. Run code-reviewer → critical[], important[], nice[]

  2. Display findings:
     ┌─────────────────────────────────────┐
     │ Review                              │
     ├─────────────────────────────────────┤
     │ Critical ([N]): MUST FIX            │
     │ Important ([N]): MUST FIX           │
     │ Nice-to-have ([N]): [list]          │
     └─────────────────────────────────────┘

  3. Use AskUserQuestion:
     IF must_fix > 0:
       - "Fix must-fix findings"
       - "Fix all findings"
       - "Approve anyway"
       - "Abort"
     ELSE:
       - "Approve"
       - "Fix nice-to-have"
       - "Abort"

  4. Handle response:
     - Fix → implement, re-test, re-review (max 3 cycles)
     - Approve → proceed
     - Abort → stop workflow
```

## Quick Mode Review

Uses same logic as Autonomous but:
- Same gate: 0 Critical + 0 Important
- Only 1 auto-fix cycle before escalate
- Focus on: correctness, security, no regressions

## Severity

- **Critical:** breaks or is exploitable on a shipped path (crash, data loss, auth bypass, breaking change without migration, dangling name that throws).
- **Important:** wrong result for a concrete input, written-rule violation, a caller of the fixed code not updated, the fixed scenario or a risky branch untested.
- **Nice-to-have:** everything else.

A finding without a concrete case is dropped, not downgraded.
