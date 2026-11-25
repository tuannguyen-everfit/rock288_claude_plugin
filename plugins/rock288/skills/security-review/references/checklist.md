# Checklist — what to hunt for in the changed lines

Seven themes. For each candidate, trace the data flow ACROSS files: where the value enters
(entry point + zone), what checks it passes, where it lands. A finding is a chain
`file:line → file:line`, not a single line that "looks unsafe".

## 1. Authentication & token lifecycle

- One-time tokens (reset, email-confirm, invite, magic link, OTP): consumed / expired / revoked
  state checked BEFORE use AND before RE-ISSUE; marked consumed atomically with the action.
- Replay: the same token / event accepted twice performs the action twice.
- Comparison of secrets/tokens in constant time (`timingSafeEqual`, `hmac.compare`), never `===`.
- Token issued for one purpose accepted for another (reset token as login token, wrong `aud`/`typ`).
- JWT: algorithm pinned, signature verified, expiry checked; `decode` used where `verify` was meant.
- Session / refresh token not invalidated on password change, logout, or account disable.

## 2. Authorization & tenant isolation

- Every query a caller can steer is scoped to the caller / tenant (`ownerId`, `teamId`,
  `workspaceId`) — not by `_id` alone (IDOR).
- A new handler applies the same guard set its siblings in the module apply (platform check,
  role check, ownership middleware). Diff the decorators / middleware list against the nearest
  sibling — guard parity is a finding even behind a trusted caller.
- Mass assignment: request body spread into an update (`{...req.body}`, `$set: body`) lets the
  caller write fields like `role`, `ownerId`, `isAdmin`.
- Authorization decided on client-supplied data (role in the body, ownerId in the query).

## 3. Credentials & PII crossing a boundary

- Responses: password hash, salt, raw tokens, internal ids that grant access, full PII of OTHER
  users. Watch `toJSON` / projections: a new field on the model is returned by every endpoint
  that returns the whole document.
- Events / messages: raw reset tokens, password hashes, full PII in a Kafka/SQS payload (every
  consumer, every log sink, every replay tool now holds it).
- Logs: tokens, passwords, auth headers, full request bodies of auth routes.
- Error messages that reveal whether an account exists (enumeration) on a PUBLIC route.

## 4. Injection

- Mongo operator injection: a request value used as a query value without type coercion
  (`{ email: req.body.email }` where `email` can be `{ "$ne": null }`).
- Command injection (`exec`, `spawn` with `shell: true`, string-built argv), path traversal
  (user value in `path.join` / file names without a fence), template injection, SSRF on the HOST
  (user-controlled host or full URL; a user-controlled PATH on a fixed host is excluded).
- Raw SQL / `$where` / `eval` / `new Function` with any user value.

## 5. Atomicity of security controls

- Check-then-act on a security control: read OTP count, then send, then increment — N parallel
  requests each pass the check. Rate caps, cooldowns, one-time tokens, balance/credit checks must
  be enforced in the write itself (conditional update, unique index, atomic increment with a
  bound).
- In scope ONLY for controls with a real cost or a security effect (SMS/email/OTP sends, token
  consumption, quota, money). A theoretical race with no security effect is excluded.

## 6. Audit integrity

- Actor, IP, user-agent or timestamp of an audit/security record taken from the request BODY
  (caller-supplied) instead of the authenticated context / transport.
- Security-relevant action (password change, role change, token issue) that the diff makes skip
  an audit write the siblings do.

## 7. Committed secrets

- A TRACKED file the diff gives a literal credential: `*.toml`, `*.y*ml`, `.env*`, Dockerfile, CI
  workflow, Makefile, k8s manifest, anything. Signing secrets (JWT/session), API keys, shared
  secrets, tokens, passwords, connection strings carrying a password, private keys. ⇒ Critical.
- A placeholder is fine; a value that would authenticate is not. When the diff also touches an
  example/template twin, compare them — a real value where the example says "ask DevOps" IS the
  finding.
- Read `.gitignore` (often in the same diff): `foo.local.toml` being ignored says nothing about
  `foo.toml`.
- Report it even when it looks like a dev/staging value: it survives in git history.
