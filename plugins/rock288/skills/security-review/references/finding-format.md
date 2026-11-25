# Finding format + severity map

## Severity (security scale) → review bucket

| Security severity | Review bucket | When |
|---|---|---|
| HIGH | **Critical** | Exploitable from the PUBLIC edge (directly or through a chain): auth bypass, token replay that performs the action, another tenant's data read/written, credential on a public response, committed secret, injection reaching a query/command |
| MEDIUM | **Important** | Concrete exploit from a reachable entry point under the threat model, but bounded (needs a valid account, leaks a narrow field, cost-bearing send without an atomic cap) |
| MEDIUM | **Important** | Guard parity: sibling handlers in the same module apply a guard the new handler lacks — regardless of zone |
| LOW | **Nice-to-have** | Hardening; behind a trusted caller (internal RPC / queue) with no threat-model exception; defence in depth |

The bucket is what the caller routes on: Critical + Important are blocking (must fix),
Nice-to-have is not. Never invent a fourth tier.

## One finding

```
N. [<HIGH|MEDIUM|LOW> → <Critical|Important|Nice-to-have>] <file>:<line> — <short title>
   Story: Anyone able to <reach entry point X, in zone Z> can <concrete effect Y>.
   Evidence: <file:line (entry)> → <file:line (missing check)> → <file:line (effect)>
   Fix: <one line — the smallest change that closes it, e.g. "add `status: 'pending'` to the findOne filter">
   Confidence: <8-10>/10
```

- **Story** names the attacker by what they can DO ("anyone with a valid reset link", "any coach
  of another team"), never "an attacker". If you cannot name who, it is not a finding.
- **Evidence** crosses files when the flow does. Every link was confirmed at the head commit.
- **Fix** is one line. A design discussion belongs in the Rejected reason or nowhere.
- The anchor `<file>:<line>` is a line the PR ADDS or CHANGES (the caller posts inline there).

## When a caller posts it

Callers that post inline mark the header `🛡️ Security · <HIGH|MEDIUM|LOW>` after the severity
label, e.g. `🔴 **Must fix** · 🛡️ Security · HIGH · \`src/auth.ts:42\``, and count security
findings separately from the rest. This skill itself posts nothing.
