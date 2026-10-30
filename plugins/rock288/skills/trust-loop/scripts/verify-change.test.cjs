#!/usr/bin/env node
/**
 * Test suite for verify-change.cjs and init-config.cjs
 * Run: node plugins/rock288/skills/trust-loop/scripts/verify-change.test.cjs
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-loop-test-'));
// Own lock file, so the suite neither waits for nor blocks a real verify-change on this machine.
process.env.RK_TRUST_LOCK = path.join(TMP, 'verify.lock');

const VERIFY = path.join(__dirname, 'verify-change.cjs');
const INIT = path.join(__dirname, 'init-config.cjs');
const lib = require(VERIFY);
const { draftConfig } = require(INIT);

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    results.push({ name, status: 'FAIL', error: error.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message || 'Not equal'}: expected ${e}, got ${a}`);
}

function makeRepo(name, tiers) {
  const root = path.join(TMP, name);
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  if (tiers) fs.writeFileSync(path.join(root, '.claude/trust.json'), JSON.stringify({ version: 1, tiers }));
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  return root;
}

function cli(script, args, cwd) {
  try {
    return { code: 0, out: execFileSync('node', [script, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { code: error.status, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

const PASS = [{ name: 'unit', cmd: 'true' }];

console.log('\n🧪 verify-change\n');

test('clean tree: nothing to verify, status not ok', () => {
  const root = makeRepo('clean', PASS);
  const run = cli(VERIFY, [], root);
  assertEqual(run.code, 0, 'exit');
  assert(run.out.includes('no change to verify'), run.out);
  assertEqual(cli(VERIFY, ['--status'], root).code, 1, 'status exit');
});

test('passing tiers write a receipt and status is ok', () => {
  const root = makeRepo('pass', PASS);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  const run = cli(VERIFY, [], root);
  assertEqual(run.code, 0, `exit (${run.out})`);
  assert(run.out.includes('VERIFIED'), run.out);
  const status = lib.status(root);
  assertEqual(status.ok, true, 'status ok');
  assertEqual(status.tiers, ['unit=pass'], 'tiers');
});

test('any edit after verifying makes the receipt stale', () => {
  const root = makeRepo('stale', PASS);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assertEqual(cli(VERIFY, [], root).code, 0, 'verify');
  fs.writeFileSync(path.join(root, 'a.txt'), 'three\n');
  assertEqual(lib.status(root).ok, false, 'stale after tracked edit');
});

test('a new untracked file changes the fingerprint', () => {
  const root = makeRepo('untracked', PASS);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  const before = lib.fingerprint(root, lib.changeSet(root));
  fs.writeFileSync(path.join(root, 'notes.md'), 'report\n');
  assert(lib.fingerprint(root, lib.changeSet(root)) !== before, 'fingerprint should change');
});

test('staging does not change the fingerprint', () => {
  const root = makeRepo('staged', PASS);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  const before = lib.fingerprint(root, lib.changeSet(root));
  execFileSync('git', ['add', 'a.txt'], { cwd: root });
  assertEqual(lib.fingerprint(root, lib.changeSet(root)), before, 'fingerprint');
});

test('a failing required tier fails and the receipt is not ok', () => {
  const root = makeRepo('fail', [{ name: 'unit', cmd: 'echo boom; exit 3' }]);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  const run = cli(VERIFY, [], root);
  assertEqual(run.code, 1, 'exit');
  assert(run.out.includes('boom'), 'prints the failing output');
  assertEqual(lib.status(root).ok, false, 'status');
});

test('a failing optional tier does not block', () => {
  const root = makeRepo('optional', [...PASS, { name: 'e2e', cmd: 'exit 1', optional: true }]);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  const run = cli(VERIFY, [], root);
  assertEqual(run.code, 0, 'exit');
  assert(run.out.includes('optional tiers failing (not blocking): e2e'), run.out);
});

test('--skip refuses a required tier', () => {
  const root = makeRepo('skip', [...PASS, { name: 'e2e', cmd: 'exit 1', optional: true }]);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assertEqual(cli(VERIFY, ['--skip=unit'], root).code, 2, 'required skip');
  const run = cli(VERIFY, ['--skip=e2e'], root);
  assertEqual(run.code, 0, 'optional skip');
  assert(lib.status(root).tiers.includes('e2e=skipped'), 'skipped recorded');
});

test('changing the tiers invalidates the receipt', () => {
  const root = makeRepo('config', PASS);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assertEqual(cli(VERIFY, [], root).code, 0, 'verify');
  // Same content, different tier list: simulate by verifying with config A, then reading with config B.
  const receipt = JSON.parse(fs.readFileSync(lib.status(root).receipt, 'utf8'));
  receipt.config_hash = 'other';
  fs.writeFileSync(lib.status(root).receipt, JSON.stringify(receipt));
  assert(/tiers changed/.test(lib.status(root).reason), 'reason');
});

test('a tier that edits the tree leaves no receipt', () => {
  const root = makeRepo('formatter', [{ name: 'fmt', cmd: 'echo formatted >> a.txt' }]);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  const run = cli(VERIFY, [], root);
  assertEqual(run.code, 1, 'exit');
  assert(run.out.includes('changed the working tree'), run.out);
});

test('receipts live under the git dir, not in the tree', () => {
  const root = makeRepo('gitdir', PASS);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  cli(VERIFY, [], root);
  assert(lib.status(root).receipt.includes(`${path.sep}.git${path.sep}rk-trust${path.sep}`), 'receipt path');
  assertEqual(lib.changeSet(root).map((f) => f.file), ['a.txt'], 'no receipt in the change set');
});

test('--baseline runs tiers on a clean tree without a receipt', () => {
  const root = makeRepo('baseline', [{ name: 'unit', cmd: 'exit 1' }]);
  const run = cli(VERIFY, ['--baseline'], root);
  assertEqual(run.code, 1, 'exit');
  assert(run.out.includes('baseline: failing tiers: unit'), run.out);
});

test('missing or invalid config is a usage error', () => {
  const root = makeRepo('noconfig');
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assertEqual(cli(VERIFY, [], root).code, 2, 'missing');
  fs.writeFileSync(path.join(root, '.claude/trust.json'), JSON.stringify({ tiers: [{ name: 'Bad Name', cmd: 'true' }] }));
  assertEqual(cli(VERIFY, [], root).code, 2, 'bad name');
});

test('a second run waits for the machine lock held by a live process', () => {
  const root = makeRepo('lock', PASS);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  // Holder outlives a shell that exits at once, so launchd/init reaps it (a child of ours would linger as a zombie).
  const holder = Number(execFileSync('sh', ['-c', 'sleep 6 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }));
  fs.writeFileSync(lib.LOCK_FILE, JSON.stringify({ pid: holder, root: '/other/repo', started: 'now' }));
  const started = Date.now();
  const run = cli(VERIFY, [], root);
  assertEqual(run.code, 0, `exit (${run.out})`);
  assert(run.out.includes('waiting: verify-change is running for /other/repo'), run.out);
  assert(Date.now() - started >= 4000, 'should have waited for the holder');
  assert(!fs.existsSync(lib.LOCK_FILE), 'lock released after the run');
});

test('a lock left by a dead process is taken over', () => {
  const root = makeRepo('stale-lock', PASS);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  fs.writeFileSync(lib.LOCK_FILE, JSON.stringify({ pid: 999999, root: '/gone', started: 'then' }));
  const run = cli(VERIFY, [], root);
  assertEqual(run.code, 0, `exit (${run.out})`);
  assert(!run.out.includes('waiting:'), run.out);
});

test('a timed-out tier is killed with every child it started', () => {
  const root = makeRepo('timeout', [{ name: 'e2e', cmd: 'sleep 30 & echo $! > child.pid; wait', optional: true, timeout_s: 1 }]);
  fs.writeFileSync(path.join(root, '.gitignore'), 'child.pid\n');
  const run = cli(VERIFY, ['--baseline'], root);
  assertEqual(run.code, 1, 'exit');
  assert(run.out.includes('timed out after 1s'), run.out);
  const pid = Number(fs.readFileSync(path.join(root, 'child.pid'), 'utf8'));
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  assert(!alive, `background child ${pid} still running`);
});

test('tiers get capped parallelism unless the env already sets it', () => {
  const env = lib.tierEnv({});
  assertEqual(env.NX_PARALLEL, '1', 'nx');
  assert(/^-p=\d+$/.test(env.GOFLAGS), env.GOFLAGS);
  assertEqual(lib.tierEnv({ NX_PARALLEL: '4', GOFLAGS: '-mod=mod -p=8' }), { NX_PARALLEL: '4', GOFLAGS: '-mod=mod -p=8' }, 'caller wins');
  assertEqual(lib.tierEnv({ GOFLAGS: '-mod=mod' }).GOFLAGS.startsWith('-mod=mod -p='), true, 'appends');
});

test('{files:ext} runs the tier on the changed files only, shell-quoted', () => {
  const root = makeRepo('scoped', [{ name: 'unit', cmd: 'printf "%s\\n" {files:ts} > ../scoped.args' }]);
  fs.writeFileSync(path.join(root, "it's.ts"), 'x\n');
  fs.writeFileSync(path.join(root, 'notes.md'), 'x\n');
  const run = cli(VERIFY, [], root);
  assertEqual(run.code, 0, `exit (${run.out})`);
  assertEqual(fs.readFileSync(path.join(TMP, 'scoped.args'), 'utf8'), "it's.ts\n", 'args');
});

test('a scoped tier with nothing in scope passes without running (clean baseline)', () => {
  const root = makeRepo('scoped-empty', [{ name: 'unit', cmd: 'exit 1 {files:ts}' }]);
  const base = cli(VERIFY, ['--baseline'], root);
  assertEqual(base.code, 0, `baseline (${base.out})`);
  assert(base.out.includes('pass (nothing in scope)'), base.out);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assertEqual(cli(VERIFY, [], root).code, 0, 'a non-ts change is out of scope');
});

test('{go_packages} lists the package dir of each changed .go file once', () => {
  const root = makeRepo('gopkgs');
  fs.mkdirSync(path.join(root, 'apps/x'), { recursive: true });
  for (const f of ['main.go', 'apps/x/a.go', 'apps/x/b_test.go', 'README.md']) fs.writeFileSync(path.join(root, f), 'x\n');
  assertEqual(lib.expandCmd('go test {go_packages}', lib.changeSet(root), root).cmd, "go test './apps/x' '.'", 'cmd');
});

test('status refuses an untracked, non-ignored trust.json until it is excluded', () => {
  const root = makeRepo('stray');
  fs.writeFileSync(path.join(root, '.claude/trust.json'), JSON.stringify({ version: 1, tiers: PASS }));
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assertEqual(cli(VERIFY, [], root).code, 0, 'verify');
  const stray = lib.status(root);
  assertEqual(stray.ok, false, 'stray config blocks the commit');
  assert(stray.reason.includes('git add -A'), stray.reason);
  fs.appendFileSync(path.join(root, '.git/info/exclude'), '.claude/trust.json\n');
  assertEqual(cli(VERIFY, [], root).code, 0, 'verify again');
  assertEqual(lib.status(root).ok, true, 'excluded config: ok');
});

console.log('\n🧪 init-config\n');

test('Go repo uses Makefile targets when present', () => {
  const root = makeRepo('go');
  fs.writeFileSync(path.join(root, 'go.mod'), 'module x\n');
  fs.writeFileSync(path.join(root, 'Makefile'), 'test:\n\tgo test ./...\nlint:\n\tgolangci-lint run\ncoverage:\n\ttrue\n');
  assertEqual(draftConfig(root).tiers.map((t) => t.cmd), ['! gofmt -l . | grep .','go vet ./...', 'make lint', 'make test', 'make coverage'], 'cmds');
});

test('Node repo picks scripts and the lockfile runner', () => {
  const root = makeRepo('node');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .', test: 'mocha', build: 'tsc' } }));
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), '');
  assertEqual(draftConfig(root).tiers, [
    { name: 'lint', cmd: 'pnpm run lint' },
    { name: 'unit', cmd: 'pnpm run test' },
    { name: 'build', cmd: 'pnpm run build', optional: true },
  ], 'tiers');
});

test('writing the config excludes it from git add -A', () => {
  const root = makeRepo('init-exclude');
  fs.writeFileSync(path.join(root, 'go.mod'), 'module x\n');
  assertEqual(cli(INIT, [], root).code, 0, 'write');
  assert(fs.readFileSync(path.join(root, '.git/info/exclude'), 'utf8').includes('.claude/trust.json\n'), 'excluded');
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  assert(!status.includes('trust.json'), status);
  assertEqual(cli(INIT, ['--force'], root).code, 0, 'rewrite');
  const lines = fs.readFileSync(path.join(root, '.git/info/exclude'), 'utf8').split('\n').filter((l) => l === '.claude/trust.json');
  assertEqual(lines.length, 1, 'excluded once, not again');
});

test('a config the repo already tracks is not excluded', () => {
  const root = makeRepo('init-tracked', PASS);
  fs.writeFileSync(path.join(root, 'go.mod'), 'module x\n');
  assertEqual(cli(INIT, ['--force'], root).code, 0, 'rewrite');
  const exclude = path.join(root, '.git/info/exclude');
  assert(!fs.existsSync(exclude) || !fs.readFileSync(exclude, 'utf8').includes('trust.json'), 'tracked: left as is');
});

test('unknown stack exits 2 and does not overwrite an existing config', () => {
  const root = makeRepo('unknown');
  assertEqual(cli(INIT, [], root).code, 2, 'unknown stack');
  const existing = makeRepo('existing', PASS);
  fs.writeFileSync(path.join(existing, 'go.mod'), 'module x\n');
  assertEqual(cli(INIT, [], existing).code, 2, 'exists');
  assertEqual(cli(INIT, ['--print'], existing).code, 0, 'print still works');
});

fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('Failed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
