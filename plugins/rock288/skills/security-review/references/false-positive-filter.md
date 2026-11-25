# False-positive filter — run it on EVERY candidate

Raw security findings are mostly noise ("by design", pre-existing, theoretical). A finding the
team dismisses costs more than a finding missed once: it teaches people to skip the 🛡️ label.

## 1. Re-check the evidence at the head commit

Open every `file:line` of the chain at `<head>` (`gh api …/contents/PATH?ref=<head>`). A link in
the chain you cannot confirm ⇒ the candidate is unverified ⇒ REJECTED ("could not verify <step>").

## 2. Confidence 1–10, keep ≥ 8

| Score | Meaning |
|---|---|
| 9–10 | Concrete exploit path from a reachable entry point, every link confirmed at head |
| 8 | Clear vulnerable pattern, reachable, one assumption you state explicitly |
| 5–7 | Plausible but depends on unverified configuration / caller behaviour ⇒ REJECTED |
| ≤ 4 | Theoretical ⇒ REJECTED |

## 3. Hard exclusions (REJECTED regardless of confidence)

- Denial of service / resource exhaustion, unbounded loops, large payloads.
- Theoretical race conditions with no security effect (see the exception below).
- Outdated dependencies / CVEs in third-party packages (a separate tool's job).
- Log spoofing / log injection; missing audit logs in general (a skipped audit write the siblings
  do is NOT excluded — checklist §6).
- Regex DoS.
- Findings in documentation, comments, or test-only code (tests, fixtures, mocks, e2e).
- SSRF where the user controls only the PATH on a fixed host.
- User text placed in an AI prompt (prompt injection) — unless the model holds a tool with a
  side effect the user could not otherwise trigger.
- Missing hardening with no concrete attack (headers, CSP, "should validate more").
- Untouched legacy code the diff does not make newly reachable (pre-existing).
- Anything that holds only for an attacker who is already a trusted caller under the threat model,
  unless one of the threat model's exceptions applies (guard parity, secrets on the wire,
  cost-bearing sends, malformed input reaching a write).

## ⚠️ Kept in scope despite looking like an exclusion

- **Rate limits / races on cost-bearing sends** (SMS, email, OTP, paid APIs) and on one-time token
  consumption: a check-then-act there is a real cost or a replay, not a theoretical race.

## 4. Output of the filter

Every candidate ends in exactly one place: the findings (≥ 8, not excluded) or the Rejected list
with its reason. The caller reconciles against both.
