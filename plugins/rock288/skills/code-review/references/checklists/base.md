# Base Review Checklist

Universal checklist for all project types. Two-pass model: critical (blocking) + informational (non-blocking).

## Instructions

Review `git diff origin/main` for the issues below. Be specific — cite `file:line` and suggest fixes. Skip anything that's fine. Only flag real problems.

**Output format:**

```
Pre-Landing Review: N issues (X critical, Y informational)

**CRITICAL** (blocking):
- [file:line] Problem description
  Fix: suggested fix

**Issues** (non-blocking):
- [file:line] Problem description
  Fix: suggested fix
```

If no issues: `Pre-Landing Review: No issues found.`

Be terse. One line problem, one line fix. No preamble.

---

## Pass 1 — CRITICAL (blocking)

### Dangling References (every NEW name must resolve)

Mechanical, and the cheapest finding there is — do it FIRST, before judging anything subjective.
A diff introduces names that point at something defined elsewhere; grep each one and confirm the
target exists. Reading the new file alone can never catch these.

- ORM/ODM relation targets — mongoose `ref:` / `refPath:`, ActiveRecord `class_name:`, SQLAlchemy `relationship()` — must match the string the target is REGISTERED under (`mongoose.model('<name>', …)`), not its file or folder name and not a pluralised guess. Grep how sibling models in the same repo spell the same ref.
- Registered name of anything NEW (model, collection, queue, topic, job, event, feature flag, DI token) against the repo's existing spelling — singular vs plural, snake vs kebab. If every sibling directory registers `foo`, a new one must not register `foos`.
- Enum / union literals (`enum: [...]`, `refPath` targets, status strings) — every member must be a value something else actually produces or accepts.
- Keys read indirectly — `process.env.X`, `config.get('a.b')`, `include('path')`, deep import paths — the key or file must exist.

Severity: **Critical** when a shipped path resolves the name today (it throws now).
**Important** when nothing resolves it yet — a schema `ref` with no `.populate()` caller is still
wrong, and will throw on the first one. NEVER a nit: a name that resolves to nothing is a defect,
not a preference.

### Injection & Data Safety
- String interpolation in SQL/database queries (even with type casting — use parameterized queries)
- Unsanitized user input written to database or rendered in HTML
- Raw HTML output from user-controlled data (`innerHTML`, `dangerouslySetInnerHTML`, `html_safe`, `raw()`, `| safe`)
- Command injection via string concatenation in shell commands (use argument arrays)
- Path traversal via user input in file operations

### Race Conditions & Concurrency
- Read-check-write without atomic operations (check-then-set should be atomic WHERE + UPDATE)
- Find-or-create without unique database constraint (concurrent calls create duplicates)
- Status transitions without atomic WHERE old_status + UPDATE new_status
- Shared mutable state accessed without synchronization

### Security Boundaries
- Missing authentication checks on new endpoints/routes
- Privilege escalation paths (user can access/modify another user's data — IDOR)
- Secrets in logs, error responses, or client-side code
- LLM/AI output written to database or used in queries without validation
- JWT/token comparison using `==` instead of constant-time comparison

### Auth & Access Control
- New API endpoints without auth middleware
- Missing authorization check (authenticated but not authorized)
- Admin-only operations accessible to regular users
- Session fixation or token reuse vulnerabilities

---

## Pass 2 — INFORMATIONAL (non-blocking)

### Conditional Side Effects
- Code branches on condition but forgets side effect on one branch (e.g., sets status but not associated data)
- Log messages claiming action happened but action was conditionally skipped

### Magic Numbers & String Coupling
- Bare numeric literals used in multiple files — should be named constants
- Error message strings used as query filters elsewhere (grep for the string)

### Duplication & Reuse (DRY)
- Logic block copy-pasted across files with only literals/names changed — extract a shared helper
- New helper/util duplicating one that already exists — grep for the function name AND its core operation before accepting a new util
- Same validation, mapping, or error-handling shape repeated at 3+ call sites
- Inline reimplementation of something the project already exposes (service method, constant, type, existing query)
- Copies that MUST change together (same business rule in 2 places) — flag even at 2 sites

### Layer & Data Placement (Conventions)
- Code placed in a layer that doesn't match its dependency — a Redis/cache read under `services/`, a cache key builder under `helpers/`, a DB query in a helper, HTTP context in a service. Check the module's folder inventory (`cache/`, `caches/`, `helpers/`, `repositories/`) and the nearest sibling module's precedent before accepting the path
- Feature-state fields appended to a core/hot model (`user`, `profile`, `account`) when the sibling feature keeps its state in its own collection — every unprojected read of the core document pays for the new fields forever, and migrating after downstream consumers ship is far harder
- Repository/data layer reading another module's model directly instead of calling that module's service (module isolation)
- Hand-rolled validation (`isPlainObject`, key loops, manual type/enum checks) where the project has a schema validator (Joi/Zod/Pydantic) — even for "tiny" guards
- Project error-envelope keys missing on a NEW error response (e.g. `localization_code`, error enum) — grep how sibling responses are built

### Dead Code & Consistency
- Variables assigned but never read
- Stale comments describing old behavior after code changed
- Import/require statements for unused modules

### Test Gaps
- Missing negative-path tests (error cases, validation failures)
- Assertions on type/status but not side effects (e.g., checks status but not that email was sent)
- Missing integration tests for security enforcement (auth, rate limiting, access control)

### Type Coercion at Boundaries
- Values crossing language/system boundaries where type could change (string vs number)
- Hash/digest inputs that don't normalize types before serialization

### Performance
- O(n*m) lookups in views/templates (array search inside loops — use hash/map lookup)
- Missing pagination on list endpoints returning unbounded results
- N+1 queries: loading associations inside loops without eager loading
- Unbounded queries without LIMIT

---

## Suppressions — DO NOT flag these

- Redundancy that aids readability (e.g., `present?` redundant with length check)
- Duplication at 2 sites that reads clearer inline and can diverge independently — premature abstraction is worse than a copy
- "Add comment explaining why this threshold was chosen" — thresholds change, comments rot
- "This assertion could be tighter" when assertion already covers the behavior
- Consistency-only changes (wrapping a value to match how another constant is guarded)
- Harmless no-ops (e.g., `.filter()` on array that never contains the filtered value)
- ANYTHING already addressed in the diff being reviewed — read the FULL diff before commenting
- Style/formatting issues (use a linter for that)
- "Consider using X instead of Y" when Y works fine
