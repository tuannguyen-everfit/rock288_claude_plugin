---
name: rk:copy-function
description: "Copy a function from the everfit-api repo into the current project with the minimum code required to run. Triggers on 'copy function', 'copy <name> from everfit-api', 'port function', 'extract function with dependencies'. Recursively traces imports/requires and copies only the symbols actually used — no dead code, no unused exports."
argument-hint: "<function-name> [--source=<repo-path>] [--dest=<dir>]"
metadata:
  author: rk
  version: "1.0.0"
---

# Copy Function

Port a single function from a source repo (default: everfit-api) into the current project, dragging along **only** the dependencies it actually needs. Output must compile/run without unused imports, unused helpers, or unused files.

## Inputs

- **Function name** (required) — e.g. `calculateMacros`, `sendWebhook`.
- `--source=<path>` (optional) — source repo root. Default: `/Users/tuannguyen/Source/everfit-api`.
- `--dest=<dir>` (optional) — destination directory. Default: `./copied/<function-name>/`.

If the function name is ambiguous (multiple definitions), list candidates with file paths and ask the user to pick one before continuing.

## Core Principle: Minimum Viable Copy

Every line copied must be reachable from the target function. If you cannot point to a call/reference chain that uses a symbol, **do not copy it**.

## Workflow

### 1. Locate the target function

- Grep for definition patterns in the source repo:
  - `function <name>(`, `const <name> =`, `<name>: function`, `<name>(` inside `module.exports`/`exports.`
  - For class methods: `<name>(` within class body
- Confirm the file and exact symbol. If ≥2 matches, ask user to disambiguate.

### 2. Build the dependency graph (recursive)

Starting from the function body, collect every external symbol it references:

- `require('...')` and `import ... from '...'` statements
- Bare identifiers resolved from module scope (top-of-file `const x = require(...)`, helper functions, constants, classes, types)
- For each resolved symbol, repeat the process on **its** definition file
- Track visited `(file, symbol)` pairs to avoid cycles

Stop traversal at:
- `node_modules` packages → keep the `require`/`import` line as-is, do not copy package source
- Built-in Node modules (`fs`, `path`, etc.) → keep as-is

### 3. Determine what to copy from each file

For every source file touched:

- Identify **only the exports actually used** by the dependency graph
- Identify **only the helpers/constants/types** those used exports depend on within that file
- Drop everything else: unused exports, unrelated functions, dead constants, unused imports

If a file exports a barrel (`module.exports = { a, b, c }`) and only `a` is needed, rewrite the export to `module.exports = { a }` (or `exports.a = a`) — do not carry `b` and `c`.

### 4. Preserve relative paths

- Mirror the source repo's directory structure under `--dest` so relative `require('../utils/foo')` paths still resolve.
- If a copied file imports something from a path you did not copy (because nothing in the graph used it), remove that import line.

### 5. Write the output

- Create `--dest` if missing.
- Write each trimmed file to its mirrored path.
- Generate `--dest/COPY_MANIFEST.md` listing:
  - Target function + origin file
  - Every copied file with the symbols kept and symbols dropped
  - External `node_modules` packages the user must install (with versions from source `package.json`)
  - New env vars introduced by the copied code (see step 5a)

### 5a. Sync new env vars into `default.env`

While building the dependency graph, collect every `process.env.<NAME>` reference reached by the copied code. For each one:

- Look up its default/example value in the **source** repo's `default.env`, `.env.example`, or equivalent (in that order).
- Check whether `<NAME>` already exists in the **destination** project's `default.env` (search from `--dest` upward to the project root). If absent, append it with the source value (or an empty placeholder if no source value was found).
- Preserve existing entries — never overwrite a value already set in destination `default.env`.
- If the destination project has no `default.env`, list the env vars in the manifest under "Env Vars" and skip the write (do not create the file unless the user asks).
- Record every added/skipped env var in `COPY_MANIFEST.md` under an "Env Vars" section.

### 6. Validate

- Run `node --check <file>` on each copied `.js`/`.ts` file (syntax check).
- Grep each copied file: every top-level `require`/`import` must resolve to either a copied file, a Node built-in, or a listed npm package.
- Report any broken references in the manifest under "Unresolved".

## Output Format

```
<dest>/
├── COPY_MANIFEST.md
├── <mirrored source path>/<file>.js
└── ...
```

`COPY_MANIFEST.md` structure:

```markdown
# Copy Manifest: <function-name>

**Origin:** <source-file>:<line>
**Entry point:** <function-name>

## Copied Files
- `path/to/file.js`
  - Kept: funcA, CONST_X
  - Dropped: funcB, funcC, helperZ

## NPM Dependencies
- lodash@4.17.21
- mongoose@7.x

## Env Vars
- Added to default.env: FOO_API_KEY (from source default.env), BAR_TIMEOUT=5000
- Skipped (already present): DATABASE_URL
- Listed only (no default.env in destination): BAZ_SECRET

## Unresolved
- (none) | <broken reference list>
```

## Rules

- **Never** copy entire files "just in case". If a symbol is not in the graph, it does not get copied.
- **Never** rewrite logic. Copy bodies verbatim; only trim unused declarations and rewrite barrel exports.
- **Never** copy `node_modules`, build artifacts, `.env`, or test files unless the user explicitly asks.
- If a function depends on global state (DB models, config singletons), list these in the manifest under a "Runtime Requirements" section so the user knows what to wire up — do not silently copy framework bootstrap code.

## Examples

### Example 1: Pure utility

User: `copy function calculateMacros from everfit-api`

Actions:
1. Find `calculateMacros` in `everfit/utils/nutrition.js`
2. Trace deps → uses `roundTo` (same file) and `lodash.sumBy`
3. Output: `copied/calculateMacros/everfit/utils/nutrition.js` containing only `calculateMacros` + `roundTo`, plus manifest noting `lodash` is needed.

### Example 2: Function with model dependency

User: `copy function sendWorkoutNotification`

Actions:
1. Find in `modules/notification/notification.service.js`
2. Traces to `models/user.js` (uses `User.findById`) and `utils/push.js` (`sendPush`)
3. Copies trimmed `notification.service.js`, `models/user.js` (only `User` schema), `utils/push.js` (only `sendPush`)
4. Manifest flags: requires Mongoose connection + Firebase Admin credentials at runtime.

## Troubleshooting

### Multiple functions match the name
**Cause:** Same name defined in multiple files (common for `handler`, `index`, etc.).
**Solution:** List all matches with file paths and ask user to pick.

### Function uses dynamic require (`require(variablePath)`)
**Cause:** Cannot statically resolve dependency.
**Solution:** Copy what is statically resolvable, list dynamic requires under "Unresolved" in manifest, ask user how to handle.

### Function depends on framework bootstrap (Express app, DI container)
**Cause:** Runtime context not portable as code.
**Solution:** Do not copy bootstrap. List required runtime context in "Runtime Requirements" section of manifest.

### Circular imports in source
**Cause:** File A imports B, B imports A.
**Solution:** Cycle detection during traversal — visit each `(file, symbol)` once. Copy both files with their needed symbols; the cycle is preserved as in the original.

## References

- `references/dependency-tracing.md` — Detailed algorithm for resolving imports in CommonJS + ES modules
- `references/trim-rules.md` — Rules for trimming files (which exports/helpers to keep, how to rewrite barrels)
