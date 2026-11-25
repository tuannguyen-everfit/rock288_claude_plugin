# Threat model — read it before judging anything

Severity depends on WHO can reach the code. The same missing check is a HIGH on a public route and
a nit on a handler only a trusted service calls. So the threat model is step 0, not an afterthought.

## Where it comes from

Read at the PR's BASE ref (a PR may edit its own threat model; it is judged against the one it
merges into), first hit wins:

```
gh api "repos/<o>/<r>/contents/.claude/rules/security.md?ref=<base>" -H 'Accept: application/vnd.github.raw'
gh api "repos/<o>/<r>/contents/docs/security.md?ref=<base>" -H 'Accept: application/vnd.github.raw'
```

A 404 on both ⇒ the default below. State which one you used in the output header.
Reading this file is part of the security pass even when a caller says "do not read repo rules":
it is the threat model, not a convention review.

## Default trust zones (no repo file)

| Zone | Trust | Examples |
|---|---|---|
| Public edge | UNTRUSTED — any internet user, any logged-in tenant | gateway / REST / GraphQL routes, webhooks from third parties, file uploads, OAuth callbacks |
| Internal RPC | TRUSTED caller | gRPC / HTTP between the org's own services behind the mesh |
| Queue consumer | TRUSTED producer | Kafka / SQS / BullMQ consumers of topics the org's services publish |
| Scheduled job | TRUSTED | cron, workers with no external input |
| Library code | as its callers | helpers, repositories, middlewares — classify by the routes that reach them |

Consequences of the default:

- "Anyone able to publish to topic X / call internal RPC Y can …" is **Nice-to-have**, never
  blocking — UNLESS one of the exceptions below applies.
- A value that ORIGINATES at the public edge and is carried through an internal hop unchanged is
  still untrusted (the hop does not launder it). Follow the evidence chain back to the edge.

## Exceptions that stay blocking even behind a trusted caller

1. **Guard parity** — sibling handlers in the same module apply a guard (platform check, tenant
   check, role check) and the new/changed handler does not. Inconsistency is how the guard gets
   bypassed when the trusted caller changes. ⇒ Important.
2. **Secrets / credentials on the wire** — a password hash, raw reset / OTP / session token, or
   private key put into a response, an event payload or a log, whatever the zone. ⇒ Important
   (Critical when the receiving side is public).
3. **Cost-bearing sends** — SMS, email, OTP, paid API calls without an atomic cap/cooldown, when
   the trigger is reachable from the public edge through any chain. ⇒ Important.
4. **Malformed input reaching a write** — a queue consumer / RPC handler that writes to the DB
   with an id or field it never validated (wrong type, missing, not an ObjectId) where the write
   then hits the wrong record or corrupts state. ⇒ Important.

## Entry-point table (put it in the output)

One line per entry point the diff ADDS or CHANGES, e.g.:

```
Entry points: src/routes/auth.ts:42 POST /reset — public edge; consumers/email-confirmed.ts:18 — queue consumer; services/account.ts:90 — library (called from 2 public routes)
```
