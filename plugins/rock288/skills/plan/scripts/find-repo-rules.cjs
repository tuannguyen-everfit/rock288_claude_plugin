#!/usr/bin/env node
/**
 * find-repo-rules.cjs — list every coding-rule source in a repo so plan/cook read them
 * instead of guessing from CLAUDE.md alone.
 *
 * Usage:
 *   node find-repo-rules.cjs [--root <dir>] [target-path ...]
 *
 * - root: defaults to the git toplevel of cwd (falls back to cwd).
 * - target paths (files or dirs the change will touch): every CLAUDE.md / AGENTS.md /
 *   .claude/rules between the target and the root is listed as "scoped" — these are the
 *   app/package rules of a monorepo that Claude Code only auto-loads when a file under
 *   them is read.
 * - no targets: every nested CLAUDE.md / AGENTS.md (depth <= 4) is listed so the caller
 *   knows they exist and can pick the ones under the directories it will touch.
 *
 * Output: one line per file — `<scope>  <lines>L  <repo-relative path>  — <when to read>`.
 * Read-only, no deps, always exits 0.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Single files at a directory level that carry rules (root or nested).
const ENTRY_FILES = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'];

// Root-only single files: other tools' agent rules + human style docs.
const ROOT_FILES = [
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
  'CONVENTIONS.md',
  'CONTRIBUTING.md',
  'docs/development-rules.md',
];

// Rule folders, walked recursively for .md/.mdc.
const RULE_DIRS = ['.claude/rules', '.cursor/rules', '.github/instructions', '.windsurf/rules'];

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', 'coverage', 'tmp', '.nx', 'plans']);
const NESTED_MAX_DEPTH = 4;

function parseArgs(argv) {
  const out = { root: null, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = argv[++i];
    else out.targets.push(argv[i]);
  }
  return out;
}

function gitRoot(cwd) {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return cwd;
  }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function walkRuleDir(dir) {
  const files = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) files.push(...walkRuleDir(p));
    else if (/\.(md|mdc)$/i.test(ent.name)) files.push(p);
  }
  return files.sort();
}

// Frontmatter scope (Claude `paths`, Cursor `globs`/`alwaysApply`) + a one-line "when to read".
function describe(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let scope = '';
  let when = '';
  let body = lines;
  if (lines[0] && lines[0].trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      const fm = lines.slice(1, end);
      body = lines.slice(end + 1);
      for (let i = 0; i < fm.length; i++) {
        const m = fm[i].match(/^(paths|globs|alwaysApply|description|applyTo):\s*(.*)$/);
        if (!m) continue;
        let val = m[2].trim().replace(/^["']|["']$/g, '');
        // YAML list on following lines: `paths:\n  - "src/**"`
        if (!val) {
          const items = [];
          while (fm[i + 1] && /^\s*-\s+/.test(fm[i + 1])) items.push(fm[++i].replace(/^\s*-\s+/, '').trim());
          val = items.join(', ');
        }
        if (!val) continue;
        if (m[1] === 'description') when = val;
        else if (m[1] === 'alwaysApply') scope = scope || (val === 'true' ? 'always' : 'on-demand');
        else scope = `paths: ${val}`;
      }
    }
  }
  if (!when) {
    const content = body.map((l) => l.trim()).filter(Boolean);
    when = content.find((l) => /^read (this|when|whenever)\b/i.test(l)) || content.find((l) => l.startsWith('#')) || content[0] || '';
  }
  return { scope, when: when.replace(/^#+\s*/, '').replace(/^["']|["']$/g, ''), lineCount: lines.length };
}

function findNested(root) {
  const found = [];
  (function walk(dir, depth) {
    if (depth > NESTED_MAX_DEPTH) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      if (!ent.isDirectory() || SKIP_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
      const sub = path.join(dir, ent.name);
      for (const f of ENTRY_FILES) if (isFile(path.join(sub, f))) found.push(path.join(sub, f));
      walk(sub, depth + 1);
    }
  })(root, 1);
  return found;
}

// Directories strictly between root and each target (target's own dir included).
function dirsUpToRoot(root, target) {
  let dir = path.resolve(root, target);
  if (!isDir(dir)) dir = path.dirname(dir);
  const dirs = [];
  while (dir.startsWith(root + path.sep)) {
    dirs.push(dir);
    dir = path.dirname(dir);
  }
  return dirs.reverse();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || gitRoot(process.cwd()));
  const rows = [];
  const seen = new Set();
  const add = (file, kind) => {
    if (seen.has(file) || !isFile(file)) return;
    seen.add(file);
    rows.push({ file, kind, ...describe(file) });
  };

  for (const f of ENTRY_FILES) add(path.join(root, f), 'root');
  for (const f of ROOT_FILES) add(path.join(root, f), 'root');
  for (const d of RULE_DIRS) if (isDir(path.join(root, d))) walkRuleDir(path.join(root, d)).forEach((f) => add(f, 'rule'));
  try {
    fs.readdirSync(path.join(root, 'docs'))
      .filter((n) => /^code-standards.*\.md$/i.test(n))
      .forEach((n) => add(path.join(root, 'docs', n), 'root'));
  } catch {}

  if (args.targets.length) {
    for (const t of args.targets) {
      for (const dir of dirsUpToRoot(root, t)) {
        for (const f of ENTRY_FILES) add(path.join(dir, f), 'scoped');
        if (isDir(path.join(dir, '.claude/rules'))) walkRuleDir(path.join(dir, '.claude/rules')).forEach((f) => add(f, 'scoped'));
      }
    }
  } else {
    findNested(root).forEach((f) => add(f, 'nested'));
  }

  if (!rows.length) {
    console.log(`No rule files under ${root} — fall back to the nearest sibling module's precedent.`);
    return;
  }
  console.log(`Rule sources in ${root}:`);
  for (const r of rows) {
    const scope = r.scope ? ` [${r.scope}]` : '';
    const when = r.when ? `  — ${r.when.slice(0, 140)}` : '';
    console.log(`${r.kind.padEnd(6)} ${String(r.lineCount).padStart(5)}L  ${path.relative(root, r.file)}${scope}${when}`);
  }
  console.log([
    '',
    'root/scoped: read in full (>400L: read the headings, then every section the change touches).',
    'rule: read every file whose "when" matches what the change touches — unsure → read it.',
    'nested: read the ones under directories the change touches (re-run with target paths to narrow).',
  ].join('\n'));
}

try {
  main();
} catch (err) {
  console.log(`find-repo-rules: ${err.message} — fall back to: ls CLAUDE.md AGENTS.md .claude/rules .cursor/rules`);
}
