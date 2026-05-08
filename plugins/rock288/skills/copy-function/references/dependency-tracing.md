# Dependency Tracing Algorithm

How to resolve every symbol a function transitively depends on.

## Step 1: Parse the entry function

For the function body, collect every identifier that is **not**:
- A parameter
- A local `var`/`let`/`const` declared inside the function
- A JS built-in (`Math`, `JSON`, `console`, `Promise`, `Array`, `Object`, etc.)

The remaining identifiers are "free variables" — they must resolve to either a top-of-file declaration or an import.

## Step 2: Resolve free variables to declarations

Search the function's file (top-level scope) for:

- `const X = require('...')` / `import X from '...'` / `import { X } from '...'`
- `function X() {}` / `const X = (...) => {}` / `class X {}`
- `const X = ...` (constant)

Each free variable maps to one of:
- **External module** (npm package or Node built-in) → record package name, do not traverse
- **Local file** (relative path require/import) → enqueue `(file, symbol)` for traversal
- **Same-file declaration** → mark symbol as "must keep in this file", recurse on its body

## Step 3: Traverse

Maintain:
- `visited: Set<(file, symbol)>` — to avoid infinite loops on cycles
- `keep: Map<file, Set<symbol>>` — what to retain per file
- `npm_deps: Set<package>` — external packages required

Worklist algorithm:
```
queue = [(entry_file, entry_function)]
while queue not empty:
  (file, sym) = queue.pop()
  if (file, sym) in visited: continue
  visited.add((file, sym))
  keep[file].add(sym)

  body = read_symbol_body(file, sym)
  for free_var in free_vars(body):
    target = resolve(free_var, file)
    if target is npm:
      npm_deps.add(target.package)
    elif target is (other_file, other_sym):
      queue.push((other_file, other_sym))
    elif target is (file, same_file_sym):
      queue.push((file, same_file_sym))
```

## Step 4: Resolve `require` / `import` paths

Given `require('../utils/foo')` from `/repo/modules/x/service.js`:
1. Resolve relative → `/repo/modules/utils/foo`
2. Try extensions in order: `.js`, `.ts`, `.json`, `/index.js`, `/index.ts`
3. First hit wins; record as the target file

For destructured imports — `const { a, b } = require('./foo')` — only enqueue `(foo, a)` and `(foo, b)` if `a` or `b` are actually referenced in the function body. Skip unused destructured names.

## Step 5: Handle re-exports

If `foo.js` only re-exports from `bar.js` (`module.exports = require('./bar')` or `export * from './bar'`):
- Follow the re-export to the real source
- Do not keep `foo.js` as an intermediate unless it adds logic
- Update copied import paths to point directly at `bar.js`

## Edge cases

- **Dynamic `require(variable)`** — cannot resolve statically. Log under "Unresolved" in manifest.
- **`require.resolve` / `require.main`** — leave as-is, log as runtime requirement.
- **Side-effect imports** (`require('./polyfill')` with no assignment) — keep the line, traverse the file but only keep top-level side-effect statements (skip its unused exports).
- **Decorators / metadata reflection** — if the function uses a class with decorators, keep decorators and traverse them as additional dependencies.
- **TypeScript types** — types vanish at runtime but break compilation if missing. Treat type-only imports the same as value imports for trimming purposes; preserve `type` keyword on `import type` lines.
