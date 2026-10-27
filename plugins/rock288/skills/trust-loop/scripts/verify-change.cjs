#!/usr/bin/env node
/**
 * Programmatic verification for trust-loop: runs the tiers a repo declares in
 * `.claude/trust.json` and writes a receipt bound to the exact working-tree content.
 *
 * Usage: node verify-change.cjs [options]
 *   (no option)       run every tier; on success write a receipt for the current change
 *   --status          is the current content verified? prints JSON; exit 0 ok, 1 not
 *   --baseline        run every tier without writing a receipt (health of the base before editing)
 *   --skip=a,b        skip these optional tiers
 *   --cwd=<dir>       repo to verify (default: process cwd)
 *
 * Fingerprint = sha256 over every path that differs from HEAD (staged or not) plus untracked,
 * non-ignored files, with their content. Any edit after verifying makes the receipt stale.
 * Receipts live under the checkout's git dir (`git rev-parse --git-path rk-trust`), so they are
 * per worktree and never committed.
 *
 * Scoped tiers: a tier `cmd` may hold `{files}`, `{files:ts,tsx}` (changed files, by extension) or
 * `{go_packages}` (`./dir` of every package with a changed .go file); they expand to the change set,
 * shell-quoted. Nothing in scope (e.g. a clean base for --baseline) → the tier passes without running.
 *
 * Machine load: one run at a time per machine (lock at ~/.claude/rk-trust/verify.lock, override
 * with RK_TRUST_LOCK); a second session waits instead of running its suites on top of the first.
 * Tiers get NX_PARALLEL=1 and GOFLAGS -p=<half the cores> unless the env already sets them, and
 * each tier runs in its own process group, killed whole on timeout, on a signal, or when it exits.
 *
 * Exit: 0 verified, 1 a required tier failed / receipt missing or stale, 2 usage or config error.
 */

const { execFileSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_PATH = '.claude/trust.json';
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const TIER_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const FAILURE_TAIL_LINES = 30;
const LOCK_FILE = process.env.RK_TRUST_LOCK || path.join(os.homedir(), '.claude', 'rk-trust', 'verify.lock');
const LOCK_POLL_MS = 5000;
const LOCK_UNREADABLE_STALE_MS = 30000;
const KILL_GRACE_MS = 5000;
const PLACEHOLDER_RE = /\{(files|go_packages)(?::([a-z0-9,]+))?\}/g;
const HALF_CPUS = Math.max(1, Math.floor((os.availableParallelism ? os.availableParallelism() : os.cpus().length) / 2));

let runningGroup = null; // pgid of the tier running now, killed if this process is stopped

class UsageError extends Error {}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function repoRoot(cwd) {
  try {
    return git(['rev-parse', '--show-toplevel'], cwd).trim();
  } catch {
    throw new UsageError(`not a git repository: ${cwd}`);
  }
}

function loadConfig(root) {
  const file = path.join(root, CONFIG_PATH);
  if (!fs.existsSync(file)) {
    throw new UsageError(`no ${CONFIG_PATH} in ${root}. Draft one: node init-config.cjs --print`);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new UsageError(`${CONFIG_PATH} is not valid JSON: ${error.message}`);
  }
  const tiers = config.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) throw new UsageError(`${CONFIG_PATH}: "tiers" must be a non-empty array`);
  const seen = new Set();
  for (const tier of tiers) {
    if (!tier || !TIER_NAME_RE.test(tier.name || '')) throw new UsageError(`${CONFIG_PATH}: tier name must be kebab-case: ${JSON.stringify(tier && tier.name)}`);
    if (seen.has(tier.name)) throw new UsageError(`${CONFIG_PATH}: duplicate tier "${tier.name}"`);
    if (typeof tier.cmd !== 'string' || !tier.cmd.trim()) throw new UsageError(`${CONFIG_PATH}: tier "${tier.name}" needs a "cmd"`);
    seen.add(tier.name);
  }
  return config;
}

function configHash(config) {
  const tiers = config.tiers.map(({ name, cmd, optional, timeout_s }) => ({ name, cmd, optional: !!optional, timeout_s: timeout_s || null }));
  return crypto.createHash('sha256').update(JSON.stringify(tiers)).digest('hex').slice(0, 16);
}

function headRef(root) {
  try {
    return git(['rev-parse', '--verify', '--quiet', 'HEAD'], root).trim();
  } catch {
    return EMPTY_TREE;
  }
}

/** Paths that differ from HEAD (staged or not) plus untracked non-ignored files, as [{file, status}]. */
function changeSet(root) {
  const entries = new Map();
  const diff = git(['diff', '--name-status', '-z', '--no-renames', headRef(root)], root).split('\0').filter(Boolean);
  for (let i = 0; i + 1 < diff.length; i += 2) entries.set(diff[i + 1], diff[i]);
  for (const file of git(['ls-files', '--others', '--exclude-standard', '-z'], root).split('\0').filter(Boolean)) {
    entries.set(file, '?');
  }
  return [...entries].map(([file, status]) => ({ file, status })).sort((a, b) => a.file.localeCompare(b.file));
}

function fingerprint(root, files) {
  const hash = crypto.createHash('sha256').update(headRef(root));
  for (const { file, status } of files) {
    hash.update(`\0${status}\0${file}\0`);
    const abs = path.join(root, file);
    const stat = status === 'D' ? null : fs.lstatSync(abs, { throwIfNoEntry: false });
    if (stat && stat.isFile()) hash.update(fs.readFileSync(abs));
    // A submodule or symlink has no file content here; its diff carries the change.
    else if (stat) hash.update(git(['diff', '--submodule=short', headRef(root), '--', file], root));
  }
  return hash.digest('hex').slice(0, 16);
}

function trustDir(root) {
  return path.resolve(root, git(['rev-parse', '--git-path', 'rk-trust'], root).trim());
}

function parseSkip(value, config) {
  if (!value) return new Set();
  const names = value.split(',').map((s) => s.trim()).filter(Boolean);
  for (const name of names) {
    const tier = config.tiers.find((t) => t.name === name);
    if (!tier) throw new UsageError(`--skip: unknown tier "${name}"`);
    if (!tier.optional) throw new UsageError(`--skip: tier "${name}" is required; only optional tiers can be skipped`);
  }
  return new Set(names);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function killGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch {
    // group already gone
  }
}

function readLock() {
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeLock(data) {
  fs.writeFileSync(LOCK_FILE, JSON.stringify(data));
}

/** One verify-change at a time on this machine: two sessions running their suites together exhaust CPU and RAM. */
async function acquireLock(root) {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  let announced = false;
  for (;;) {
    try {
      fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, root, started: new Date().toISOString() }), { flag: 'wx' });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const holder = readLock();
    const stat = fs.statSync(LOCK_FILE, { throwIfNoEntry: false });
    const busy = holder ? isAlive(holder.pid) : !!stat && Date.now() - stat.mtimeMs < LOCK_UNREADABLE_STALE_MS;
    if (busy) {
      if (!announced && holder) console.log(`waiting: verify-change is running for ${holder.root} (pid ${holder.pid}, since ${holder.started}); one run per machine`);
      announced = true;
      await sleep(LOCK_POLL_MS);
      continue;
    }
    // The owner died mid-run (e.g. killed by a tool timeout): stop the tier it left behind, then take over.
    if (holder && holder.pgid) killGroup(holder.pgid, 'SIGKILL');
    if (JSON.stringify(readLock()) === JSON.stringify(holder)) fs.rmSync(LOCK_FILE, { force: true });
  }
}

function releaseLock() {
  const holder = readLock();
  if (holder && holder.pid === process.pid) fs.rmSync(LOCK_FILE, { force: true });
}

/** Child env capping test-runner parallelism to half the machine; values the caller already set win. */
function tierEnv(env = process.env) {
  const out = { ...env };
  if (!out.NX_PARALLEL) out.NX_PARALLEL = '1';
  if (!/(^|\s)-p[= ]/.test(out.GOFLAGS || '')) out.GOFLAGS = `${out.GOFLAGS ? `${out.GOFLAGS} ` : ''}-p=${HALF_CPUS}`;
  return out;
}

/** Runs one tier in its own process group, output streamed to the log, so a timeout or a stop kills every child. */
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Fills `{files[:ext,...]}` / `{go_packages}` from the change set; `empty` when every placeholder has nothing. */
function expandCmd(cmd, files, root) {
  const present = files.filter((f) => f.status !== 'D' && fs.existsSync(path.join(root, f.file))).map((f) => f.file);
  let found = 0;
  let filled = 0;
  const expanded = cmd.replace(PLACEHOLDER_RE, (_, kind, exts) => {
    found++;
    let values;
    if (kind === 'go_packages') {
      const dirs = files.filter((f) => f.file.endsWith('.go')).map((f) => path.dirname(f.file));
      values = [...new Set(dirs)].filter((d) => fs.existsSync(path.join(root, d))).map((d) => (d === '.' ? '.' : `./${d}`));
    } else {
      const wanted = exts ? exts.split(',').map((e) => `.${e}`) : null;
      values = wanted ? present.filter((f) => wanted.includes(path.extname(f))) : present;
    }
    if (values.length) filled++;
    return values.map(shellQuote).join(' ');
  });
  return { cmd: expanded, scoped: found > 0, empty: found > 0 && filled === 0 };
}

function runTier(tier, root, logFile, files) {
  const started = Date.now();
  const { cmd, scoped, empty } = expandCmd(tier.cmd, files, root);
  if (empty) {
    fs.writeFileSync(logFile, '[verify-change] nothing in scope: no changed file matches this tier\n');
    return Promise.resolve({ name: tier.name, cmd: tier.cmd, optional: !!tier.optional, status: 'pass', scope: 'empty', exit_code: null, duration_ms: 0, log: logFile, output: '' });
  }
  const fd = fs.openSync(logFile, 'w');
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd: root, shell: true, detached: true, env: tierEnv(), stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    let note = '';
    let timer = null;
    if (child.pid) {
      runningGroup = child.pid;
      const holder = readLock();
      if (holder && holder.pid === process.pid) writeLock({ ...holder, pgid: child.pid });
    }
    if (tier.timeout_s) {
      timer = setTimeout(() => {
        note = `\n[verify-change] timed out after ${tier.timeout_s}s; killed the tier's process group\n`;
        killGroup(child.pid, 'SIGTERM');
        setTimeout(() => killGroup(child.pid, 'SIGKILL'), KILL_GRACE_MS).unref();
      }, tier.timeout_s * 1000);
    }
    let done = false;
    const finish = (code, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Reap anything the tier left running in the background (servers, watchers).
      if (child.pid) killGroup(child.pid, 'SIGKILL');
      runningGroup = null;
      if (error) note += `\n[verify-change] ${error.message}\n`;
      if (note) fs.appendFileSync(logFile, note);
      resolve({
        name: tier.name,
        cmd: tier.cmd,
        optional: !!tier.optional,
        status: code === 0 && !note ? 'pass' : 'fail',
        ...(scoped && { ran: cmd }),
        exit_code: code,
        duration_ms: Date.now() - started,
        log: logFile,
        output: fs.readFileSync(logFile, 'utf8'),
      });
    };
    child.on('error', (error) => finish(null, error));
    child.on('exit', (code) => finish(code));
  });
}

function tail(text, lines) {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

async function runTiers(root, config, skip, evidenceDir, files) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const results = [];
  for (const tier of config.tiers) {
    if (skip.has(tier.name)) {
      results.push({ name: tier.name, cmd: tier.cmd, optional: true, status: 'skipped' });
      console.log(`- ${tier.name}: skipped`);
      continue;
    }
    process.stdout.write(`- ${tier.name}: ${tier.cmd} ... `);
    const { output, ...result } = await runTier(tier, root, path.join(evidenceDir, `${tier.name}.log`), files);
    results.push(result);
    console.log(result.scope === 'empty' ? 'pass (nothing in scope)' : `${result.status} (${(result.duration_ms / 1000).toFixed(1)}s)`);
    if (result.status === 'fail') console.log(`${tail(output, FAILURE_TAIL_LINES)}\n  full log: ${result.log}`);
  }
  return results;
}

function receiptPath(root, fp) {
  return path.join(trustDir(root), 'receipts', `${fp}.json`);
}

function status(root) {
  const config = loadConfig(root);
  const files = changeSet(root);
  if (files.length === 0) return { ok: false, reason: 'no change to verify' };
  const fp = fingerprint(root, files);
  const file = receiptPath(root, fp);
  if (!fs.existsSync(file)) return { ok: false, fingerprint: fp, reason: 'no receipt for the current content; run verify-change (any edit after verifying invalidates the receipt)' };
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (receipt.config_hash !== configHash(config)) return { ok: false, fingerprint: fp, reason: `${CONFIG_PATH} tiers changed since this receipt; run verify-change again` };
  if (!receipt.ok) return { ok: false, fingerprint: fp, reason: 'the receipt for the current content is failing', receipt: file };
  return { ok: true, fingerprint: fp, receipt: file, tiers: receipt.tiers.map((t) => `${t.name}=${t.status}`) };
}

async function verify(root, { baseline = false, skip = '' } = {}) {
  const config = loadConfig(root);
  const skipSet = parseSkip(skip, config);
  const files = changeSet(root);

  if (baseline) {
    const results = await runTiers(root, config, skipSet, path.join(trustDir(root), 'baseline', String(Date.now())), files);
    const failing = results.filter((r) => r.status === 'fail').map((r) => r.name);
    console.log(failing.length ? `\nbaseline: failing tiers: ${failing.join(', ')}` : '\nbaseline: all tiers pass');
    return failing.length ? 1 : 0;
  }

  if (files.length === 0) {
    console.log('no change to verify (working tree matches HEAD)');
    return 0;
  }
  const fp = fingerprint(root, files);
  console.log(`verifying ${files.length} changed file(s), fingerprint ${fp}`);
  const results = await runTiers(root, config, skipSet, path.join(trustDir(root), 'evidence', fp), files);

  const after = fingerprint(root, changeSet(root));
  if (after !== fp) {
    console.log(`\nthe tiers changed the working tree (${fp} -> ${after}), e.g. a formatter. Review the edit, then run verify-change again.`);
    return 1;
  }

  const ok = results.every((r) => r.status !== 'fail' || r.optional);
  const receipt = {
    schema: 1,
    fingerprint: fp,
    head: headRef(root),
    ok,
    created_at: new Date().toISOString(),
    config_hash: configHash(config),
    files,
    tiers: results,
  };
  const file = receiptPath(root, fp);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
  fs.writeFileSync(path.join(path.dirname(file), 'latest.json'), JSON.stringify(receipt, null, 2));

  const optionalFailed = results.filter((r) => r.status === 'fail' && r.optional).map((r) => r.name);
  console.log(`\n${ok ? 'VERIFIED' : 'FAILED'} · receipt ${file}`);
  if (optionalFailed.length) console.log(`optional tiers failing (not blocking): ${optionalFailed.join(', ')}`);
  return ok ? 0 : 1;
}

function parseArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split(/=(.*)/s);
    if (!['status', 'baseline', 'skip', 'cwd'].includes(key) || !arg.startsWith('--')) throw new UsageError(`unknown option: ${arg}`);
    opts[key] = value === undefined ? true : value;
  }
  return opts;
}

function onStop(signal, code) {
  process.on(signal, () => {
    if (runningGroup) killGroup(runningGroup, 'SIGKILL');
    releaseLock();
    process.exit(code);
  });
}

async function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const root = repoRoot(path.resolve(opts.cwd || process.cwd()));
    if (opts.status) {
      const result = status(root);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }
    loadConfig(root); // fail fast on a bad config before waiting for the lock
    onStop('SIGINT', 130);
    onStop('SIGTERM', 143);
    onStop('SIGHUP', 129);
    process.on('exit', releaseLock);
    await acquireLock(root);
    process.exit(await verify(root, { baseline: !!opts.baseline, skip: opts.skip }));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`verify-change: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = { CONFIG_PATH, LOCK_FILE, UsageError, git, repoRoot, loadConfig, changeSet, fingerprint, status, verify, tierEnv, expandCmd };
