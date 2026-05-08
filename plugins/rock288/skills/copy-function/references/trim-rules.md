# Trim Rules

How to trim each copied file down to the minimum required content.

## Per-file trimming procedure

Given a source file and the set of symbols it must keep (`keep_set`):

### 1. Keep declarations in `keep_set`

Top-level `function`, `const`, `let`, `class`, `type`, `interface` declarations whose name is in `keep_set` are retained verbatim.

### 2. Keep transitive same-file dependencies

If a kept symbol references another top-level symbol in the same file (helper function, constant, internal class), add that symbol to `keep_set` and retain it. Repeat until no new symbols are added.

### 3. Drop unused declarations

Every other top-level declaration → delete.

### 4. Trim imports / requires

For each `require` / `import` at the top of the file:
- If none of the bound names are referenced by any kept symbol → **delete the entire import line**
- If only some destructured names are referenced → **rewrite to keep only used names**:
  ```js
  // before
  const { a, b, c } = require('./utils');
  // after (only `a` is used)
  const { a } = require('./utils');
  ```
- Side-effect-only imports (`require('./polyfill')` with no assignment) → keep only if the file still depends on the side effect; otherwise drop.

### 5. Rewrite exports

Strip exports of dropped symbols.

CommonJS:
```js
// before
module.exports = { funcA, funcB, funcC };
// after (only funcA needed)
module.exports = { funcA };
```

```js
// before
exports.funcA = funcA;
exports.funcB = funcB;
// after
exports.funcA = funcA;
```

ES modules:
```js
// before
export { funcA, funcB, funcC };
// after
export { funcA };
```

```js
// before
export default { funcA, funcB };
// after
export default { funcA };
```

If the file's only kept symbol is the default export, keep `export default` as-is.

### 6. Preserve top-of-file context

Always keep:
- File-level `'use strict'` directives
- License/copyright comments at the top
- TypeScript triple-slash directives (`/// <reference ... />`) if any kept symbol relies on the referenced types

### 7. Drop unused type imports (TypeScript only)

After trimming values, scan kept symbols' type annotations. Any `import type { X }` where `X` is not referenced → drop.

## Special file shapes

### Barrel files (`index.js` re-exporting siblings)

Example source:
```js
// utils/index.js
module.exports = {
  ...require('./math'),
  ...require('./string'),
  ...require('./date'),
};
```

If only `./math` exports are needed:
1. Skip the barrel entirely if downstream callers can import `./math` directly.
2. If the barrel must remain (because callers import from `utils/index`), trim it to:
   ```js
   module.exports = { ...require('./math') };
   ```

Prefer option 1 — rewrite the caller's import path to skip the barrel — to reduce file count.

### Schema files (Mongoose, Zod, etc.)

Schemas often define many fields, all of which "look used" because they're declared inside one object literal. Keep the entire schema definition intact even if the function only reads two fields — partial schemas break model validation at runtime.

Drop only schema methods (`.methods.foo`) and statics (`.statics.bar`) that are not in `keep_set`.

### Class files

If a class is in `keep_set` but only some methods are needed:
- Keep the class declaration
- Keep the constructor
- Keep methods referenced by the dependency graph
- Drop unreferenced methods, getters, setters
- Keep all instance properties initialized in the constructor (they may be implicit dependencies of kept methods)

## Validation after trimming

For each trimmed file:
1. Run `node --check <file>` — catches syntax errors from over-aggressive deletion.
2. Grep for every name on the right-hand side of kept declarations; confirm each is either declared in the file, imported, a JS built-in, or a function parameter.
3. If any name is unresolved, the trim was too aggressive — restore the missing declaration.

## Output formatting

- Preserve original indentation and quote style.
- Do not reformat with Prettier/ESLint — that produces noisy diffs and risks breaking string-sensitive code.
- Leave one blank line between kept declarations even if the original had more (or fewer) — this is the only formatting normalization allowed.
