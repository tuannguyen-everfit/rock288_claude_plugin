#!/usr/bin/env node
/**
 * What /rk:pr-follow-up must remember between runs of one PR: the review thread, the Jira card, the checkout, when the
 * last run read the PR (so only newer feedback counts), how many fix rounds have run, and the deploy pipelines.
 * One JSON file per PR under the repo's shared git dir (`<git common dir>/rk-trust/follow-up/`), so every worktree of
 * the repo sees it and nothing is committed.
 *
 *   node follow-up-state.cjs init  --pr <owner/repo#n | url> [--ticket CHAL-1] [--slack-channel <id>] [--slack-ts <ts>]
 *                                  [--worktree <path>] [--deploy-channel <id>] [--pipelines <a,b>] [--max-run-min <n>]
 *                                  [--dev-check <cmd>]
 *   node follow-up-state.cjs start --pr <ref>   # prints the state, records this run's start time
 *   node follow-up-state.cjs round --pr <ref>   # counts a fix round; exit 3 past MAX_FIX_ROUNDS
 *   node follow-up-state.cjs set   --pr <ref> key=value ...
 *   node follow-up-state.cjs get   --pr <ref>
 *   node follow-up-state.cjs list               # follow-ups not yet done
 *
 * "start" prints `since` (the previous run's start, for pr-review-state.cjs --since) and `idle_hours` (since
 * `last_activity_at`). Phases: in_review, approved, merged, deployed, waiting_human, idle, deploy_failed, done.
 * Ported from core-foundry tools/post-merge/follow-up-state.mjs.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parsePrRef } = require('./pr-review-state.cjs');

const MAX_FIX_ROUNDS = 3;

function stateDir(gitCommonDir) {
  return path.join(gitCommonDir, 'rk-trust', 'follow-up');
}

function stateFile(gitCommonDir, ref) {
  const { owner, name, number } = parsePrRef(ref);
  return path.join(stateDir(gitCommonDir), `${owner}-${name}-${number}.json`);
}

function createStore(gitCommonDir, now = () => new Date().toISOString()) {
  const read = (ref) => {
    const file = stateFile(gitCommonDir, ref);
    if (!fs.existsSync(file)) throw new Error(`no follow-up state for ${ref}; run init first`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  const write = (ref, state) => {
    const file = stateFile(gitCommonDir, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
    return state;
  };
  return {
    init(ref, fields = {}) {
      const { owner, name, number } = parsePrRef(ref);
      const existing = fs.existsSync(stateFile(gitCommonDir, ref)) ? read(ref) : {};
      return write(ref, {
        pr: `${owner}/${name}#${number}`,
        created_at: existing.created_at || now(),
        phase: existing.phase || 'in_review',
        last_run_at: existing.last_run_at || null,
        fix_rounds: existing.fix_rounds || 0,
        ...existing,
        ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
      });
    },
    get: read,
    /**
     * Start a run: return the state with `since` = the previous run's start and `idle_hours` = time since the last
     * activity (`last_activity_at`, set when feedback, an approval or the merge is handled; else `created_at`).
     */
    start(ref) {
      const state = read(ref);
      const since = state.last_run_at;
      const runAt = now();
      const idleHours = Math.round((Date.parse(runAt) - Date.parse(state.last_activity_at || state.created_at)) / 360000) / 10;
      write(ref, { ...state, last_run_at: runAt });
      return { ...state, since, idle_hours: idleHours };
    },
    round(ref) {
      const state = read(ref);
      const fix_rounds = (state.fix_rounds || 0) + 1;
      write(ref, { ...state, fix_rounds });
      return { fix_rounds, escalate: fix_rounds > MAX_FIX_ROUNDS };
    },
    set(ref, pairs) {
      const state = read(ref);
      for (const pair of pairs) {
        const i = pair.indexOf('=');
        if (i < 1) throw new Error(`expected key=value, got ${pair}`);
        const raw = pair.slice(i + 1);
        state[pair.slice(0, i)] = /^-?\d+$/.test(raw) ? Number(raw) : raw === 'null' ? null : raw;
      }
      return write(ref, state);
    },
    list() {
      const dir = stateDir(gitCommonDir);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
        .filter((s) => s.phase !== 'done');
    },
  };
}

function gitCommonDir(cwd) {
  return path.resolve(cwd, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim());
}

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const print = (value) => console.log(JSON.stringify(value, null, 2));
  try {
    const store = createStore(gitCommonDir(process.cwd()));
    const ref = opt('--pr');
    if (command === 'list') print(store.list());
    else if (!ref) throw new Error('--pr <owner/repo#n | url> is required');
    else if (command === 'init') {
      const pipelines = opt('--pipelines');
      print(store.init(ref, {
        ticket: opt('--ticket'),
        slack_channel: opt('--slack-channel'),
        slack_thread_ts: opt('--slack-ts'),
        worktree: opt('--worktree') ? path.resolve(opt('--worktree')) : undefined,
        deploy_channel: opt('--deploy-channel'),
        pipelines: pipelines ? pipelines.split(',').map((p) => p.trim()).filter(Boolean) : undefined,
        max_run_min: opt('--max-run-min') ? Number(opt('--max-run-min')) : undefined,
        dev_check: opt('--dev-check'),
      }));
    } else if (command === 'start') print(store.start(ref));
    else if (command === 'get') print(store.get(ref));
    else if (command === 'set') print(store.set(ref, args.filter((a, i) => a.includes('=') && args[i - 1] !== '--pr')));
    else if (command === 'round') {
      const result = store.round(ref);
      print(result);
      if (result.escalate) process.exit(3);
    } else throw new Error(`unknown command ${command || ''}: init | start | round | set | get | list`);
  } catch (error) {
    console.error(`follow-up-state: ${error.message}`);
    process.exit(64);
  }
}

module.exports = { MAX_FIX_ROUNDS, createStore, stateFile };
