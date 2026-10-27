#!/usr/bin/env node
/**
 * Drafts `.claude/trust.json` for trust-loop from the repo's stack (Go or Node).
 *
 * Usage: node init-config.cjs [--print] [--force] [--cwd=<dir>]
 *   --print   show the draft, write nothing
 *   --force   overwrite an existing .claude/trust.json
 *
 * The draft is a starting point: the repo's own CLAUDE.md / CI decide the real gates, so the
 * human confirms it before trust-loop relies on it.
 * Exit: 0 written or printed, 2 usage error / unknown stack / config already exists.
 */

const fs = require('fs');
const path = require('path');
const { CONFIG_PATH, UsageError, git, repoRoot } = require('./verify-change.cjs');

const DEFAULT_PROTECTED = ['main', 'master', 'develop'];

function makeTargets(root) {
  const file = path.join(root, 'Makefile');
  if (!fs.existsSync(file)) return new Set();
  return new Set([...fs.readFileSync(file, 'utf8').matchAll(/^([A-Za-z0-9_-]+):/gm)].map((m) => m[1]));
}

function goTiers(root) {
  const make = makeTargets(root);
  const hasGolangci = ['.golangci.yml', '.golangci.yaml', '.golangci.toml'].some((f) => fs.existsSync(path.join(root, f)));
  const tiers = [
    // grep prints the unformatted files and exits 0 when it finds one, so `!` fails the tier.
    { name: 'fmt', cmd: '! gofmt -l . | grep .' },
    { name: 'vet', cmd: 'go vet ./...' },
  ];
  if (make.has('lint')) tiers.push({ name: 'lint', cmd: 'make lint' });
  else if (hasGolangci) tiers.push({ name: 'lint', cmd: 'golangci-lint run' });
  tiers.push({ name: 'unit', cmd: make.has('test') ? 'make test' : 'go test -race -count=1 ./...' });
  if (make.has('coverage')) tiers.push({ name: 'coverage', cmd: 'make coverage' });
  return tiers;
}

function nodeTiers(root) {
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {};
  const runner = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm run'
    : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : 'npm run';
  const pick = (...names) => names.find((n) => scripts[n]);
  const tiers = [];
  const lint = pick('lint');
  const typecheck = pick('typecheck', 'type-check', 'tsc');
  const unit = pick('test:unit', 'test');
  const build = pick('build');
  if (lint) tiers.push({ name: 'lint', cmd: `${runner} ${lint}` });
  if (typecheck) tiers.push({ name: 'typecheck', cmd: `${runner} ${typecheck}` });
  if (unit) tiers.push({ name: 'unit', cmd: `${runner} ${unit}` });
  if (build) tiers.push({ name: 'build', cmd: `${runner} ${build}`, optional: true });
  return tiers;
}

function baseBranch(root) {
  try {
    return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], root).trim().replace(/^origin\//, '');
  } catch {
    return null;
  }
}

function draftConfig(root) {
  let stack;
  let tiers;
  if (fs.existsSync(path.join(root, 'go.mod'))) [stack, tiers] = ['go', goTiers(root)];
  else if (fs.existsSync(path.join(root, 'package.json'))) [stack, tiers] = ['node', nodeTiers(root)];
  if (!tiers || tiers.length === 0) {
    throw new UsageError(`cannot detect the verification commands in ${root}; write ${CONFIG_PATH} by hand (see references/trust-config.md)`);
  }
  return {
    version: 1,
    stack,
    base_branch: baseBranch(root),
    protected_branches: DEFAULT_PROTECTED,
    tiers,
  };
}

function main() {
  try {
    const args = process.argv.slice(2);
    for (const arg of args) {
      if (!/^--(print|force|cwd=.+)$/.test(arg)) throw new UsageError(`unknown option: ${arg}`);
    }
    const cwdArg = args.find((a) => a.startsWith('--cwd='));
    const root = repoRoot(path.resolve(cwdArg ? cwdArg.slice('--cwd='.length) : process.cwd()));
    const config = draftConfig(root);
    const json = `${JSON.stringify(config, null, 2)}\n`;
    if (args.includes('--print')) {
      process.stdout.write(json);
      return;
    }
    const file = path.join(root, CONFIG_PATH);
    if (fs.existsSync(file) && !args.includes('--force')) {
      throw new UsageError(`${file} already exists; pass --force to overwrite`);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, json);
    console.log(`wrote ${file}\n${json}`);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`init-config: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = { draftConfig };
