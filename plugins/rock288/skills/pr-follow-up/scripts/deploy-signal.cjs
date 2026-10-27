#!/usr/bin/env node
/**
 * Has the merged PR reached dev yet? Reads the AWS CodePipeline bot messages from Slack #non-prod-ci-cd. They carry
 * no commit SHA, so the decision comes from timing. Every run builds the develop head at the moment it starts.
 *
 * 1. Paired (the fast answer): S = the first STARTED at or after the merge. Runs started in the max-run window before S
 *    and not finished by S are still in flight; with k of them, the (k+1)-th finish after S is ours (runs finish in
 *    order). SUCCEEDED → deployed. A merge with no later run would otherwise never be proven (PR #258: the notif run
 *    started 4 s after the merge and succeeded 6 min later, and nothing ran after it).
 * 2. Timing (the fallback when a STARTED is missing; the bot skips some): a SUCCEEDED more than --max-run-min after
 *    the merge can only come from a run that started after it.
 * Event times come from the message's `*Time :*` field (the pipeline's clock), not the Slack post time, which lags by
 * 10-20 s and could put a run that started just before the merge after it.
 *
 *   node deploy-signal.cjs --merged-at <iso> --pipeline <name> [--pipeline <name> ...] --messages <file> [--messages ...]
 *                          [--max-run-min 35] [--timeout-min 90] [--now <iso>]
 *
 * --messages: what slack_read_channel returned for the channel (oldest = merged_at minus 1h), one file per page, or a
 * JSON array of { ts, text }. Several --pipeline (a PR touching several apps): deployed once every one is.
 * Prints a JSON decision. Exit: 0 deployed, 2 waiting, 1 failed / timeout, 64 usage.
 *
 *   node deploy-signal.cjs pick [--base origin/develop]
 *
 * Which pipelines this branch deploys through: `deploy` in `.claude/trust.json` (see trust-loop
 * references/trust-config.md) mapped over the files changed against the base. Prints { channel, max_run_min,
 * pipelines }; exit 2 when the repo has no `deploy` config yet.
 * Ported from core-foundry tools/post-merge/dev-deploy-signal.mjs (pipeline and run time made per repo).
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_RUN_MIN = 35;
const DEFAULT_TIMEOUT_MIN = 90;
const FINISH_OK = new Set(['SUCCEEDED']);
const FINISH_BAD = new Set(['FAILED', 'STOPPED', 'CANCELED', 'CANCELLED']);

/** The read_channel tool returns {"messages": "<text>", ...}; accept that wrapper or the bare text. */
function unwrapToolOutput(text) {
  if (!text.startsWith('{')) return text;
  try {
    return JSON.parse(text).messages || text;
  } catch {
    return text;
  }
}

/** Pipeline events from the read_channel text or a JSON array of { ts, text }, oldest first. */
function parsePipelineEvents(raw) {
  const trimmed = raw.trim();
  const messages = trimmed.startsWith('[')
    ? JSON.parse(trimmed).map((m) => ({ ts: Number(m.ts), text: m.text || '' }))
    : unwrapToolOutput(trimmed)
        .split(/^=== Message from /m)
        .slice(1)
        .map((block) => {
          const ts = block.match(/Message TS:\s*([\d.]+)/);
          return { ts: Number(ts && ts[1]), text: block };
        });
  const events = [];
  for (const { ts, text } of messages) {
    const hit = text.match(/([\w-]+-codepipeline)\s+\*([A-Z]+)\*/);
    if (!hit || !Number.isFinite(ts)) continue;
    events.push({ at: pipelineTime(text) || ts * 1000, pipeline: hit[1], status: hit[2] });
  }
  return events.sort((a, b) => a.at - b.at);
}

/** `*Time :* 2026-10-27 09:48:49 GMT+7` → epoch ms, or null. */
function pipelineTime(text) {
  const m = text.match(/\*Time :\*\s*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) GMT([+-]\d{1,2})/);
  if (!m) return null;
  const offset = Number(m[3]);
  const sign = offset < 0 ? '-' : '+';
  const at = Date.parse(`${m[1]}T${m[2]}${sign}${String(Math.abs(offset)).padStart(2, '0')}:00`);
  return Number.isFinite(at) ? at : null;
}

const iso = (ms) => new Date(ms).toISOString();
const isFinish = (e) => FINISH_OK.has(e.status) || FINISH_BAD.has(e.status);

/** Rule 1: the finish of the first run started at/after the merge, or null when it cannot be told yet. */
function pairedFinish(all, { mergedAt, maxRunMin }) {
  const start = all.find((e) => e.status === 'STARTED' && e.at >= mergedAt);
  if (!start) return null;
  const before = all.filter((e) => e.at >= start.at - maxRunMin * 60000 && e.at < start.at);
  const startsBefore = before.filter((e) => e.status === 'STARTED');
  const finishesBefore = startsBefore.length ? before.filter((e) => isFinish(e) && e.at > startsBefore[0].at) : [];
  const inFlight = Math.max(0, startsBefore.length - finishesBefore.length);
  const finish = all.filter((e) => isFinish(e) && e.at > start.at)[inFlight];
  return finish ? { start, finish, inFlight } : null;
}

/** One pipeline. Times are epoch ms. Returns { pipeline, state, reason, finished_at? }. */
function decidePipeline(events, { pipeline, mergedAt, now, maxRunMin = DEFAULT_MAX_RUN_MIN, timeoutMin = DEFAULT_TIMEOUT_MIN }) {
  const all = events.filter((e) => e.pipeline === pipeline);
  const ours = all.filter((e) => e.at >= mergedAt);
  const paired = pairedFinish(all, { mergedAt, maxRunMin });
  if (paired && FINISH_OK.has(paired.finish.status)) {
    const skipped = paired.inFlight ? `, after ${paired.inFlight} run(s) already in flight` : '';
    return { pipeline, state: 'deployed', finished_at: iso(paired.finish.at), reason: `${pipeline} run started ${iso(paired.start.at)} (after the merge) succeeded at ${iso(paired.finish.at)}${skipped}` };
  }
  const cutoff = mergedAt + maxRunMin * 60000;
  const proof = ours.find((e) => FINISH_OK.has(e.status) && e.at >= cutoff);
  if (proof) {
    return { pipeline, state: 'deployed', finished_at: iso(proof.at), reason: `${pipeline} succeeded at ${iso(proof.at)}, more than ${maxRunMin} min after the merge, so that run started after it` };
  }
  if (paired && !ours.some((e) => e.status === 'STARTED' && e.at > paired.finish.at)) {
    return { pipeline, state: 'failed', reason: `${pipeline} run started ${iso(paired.start.at)} (after the merge) ended ${paired.finish.status} at ${iso(paired.finish.at)}, and no run started since` };
  }
  if (now - mergedAt > timeoutMin * 60000) {
    const failures = ours.filter((e) => FINISH_BAD.has(e.status));
    return failures.length
      ? { pipeline, state: 'failed', reason: `no ${pipeline} success within ${timeoutMin} min of the merge; ${failures.length} run(s) ended ${failures.map((f) => f.status).join(', ')}` }
      : { pipeline, state: 'timeout', reason: `no ${pipeline} success within ${timeoutMin} min of the merge` };
  }
  const started = ours.find((e) => e.status === 'STARTED');
  return { pipeline, state: 'waiting', reason: started ? `${pipeline} run started ${iso(started.at)}; a success after ${iso(cutoff)} proves the deploy` : `no ${pipeline} run started since the merge yet` };
}

/** Every pipeline the PR deploys through. failed > timeout > waiting > deployed. */
function decideDeploy(events, { pipelines, ...opts }) {
  const results = pipelines.map((pipeline) => decidePipeline(events, { ...opts, pipeline }));
  const state = ['failed', 'timeout', 'waiting'].find((s) => results.some((r) => r.state === s)) || 'deployed';
  const deployedBy = state === 'deployed' ? results.map((r) => r.finished_at).sort().pop() : null;
  return { state, deployed_by: deployedBy, pipelines: results };
}

/**
 * Map changed files to pipelines. `map` keys are path prefixes (longest wins) or "*" for every other file; values are
 * one pipeline name or a list. Returns the sorted, de-duplicated pipelines.
 */
function pickPipelines(map, files) {
  const prefixes = Object.keys(map).filter((k) => k !== '*').sort((a, b) => b.length - a.length);
  const picked = new Set();
  for (const file of files) {
    const key = prefixes.find((p) => file.startsWith(p)) || (map['*'] ? '*' : null);
    if (key) [].concat(map[key]).forEach((name) => picked.add(name));
  }
  return [...picked].sort();
}

function pick(base) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const configFile = path.join(root, '.claude', 'trust.json');
  const deploy = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')).deploy : null;
  if (!deploy || !deploy.pipelines) {
    console.error('deploy-signal: no "deploy" in .claude/trust.json; find the pipeline in the channel and add it');
    process.exit(2);
  }
  const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  console.log(JSON.stringify({
    channel: deploy.channel || 'C06HA7VQHNZ',
    max_run_min: deploy.max_run_min || DEFAULT_MAX_RUN_MIN,
    pipelines: pickPipelines(deploy.pipelines, files),
  }, null, 2));
}

if (require.main === module && process.argv[2] === 'pick') {
  const args = process.argv.slice(3);
  pick(args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/develop');
} else if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const all = (name) => args.flatMap((a, i) => (args[i - 1] === name ? [a] : []));
  const mergedAt = Date.parse(opt('--merged-at') || '');
  const files = all('--messages');
  const pipelines = all('--pipeline');
  if (!Number.isFinite(mergedAt) || !files.length || !pipelines.length) {
    console.error('usage: deploy-signal.cjs --merged-at <iso> --pipeline <name> [--pipeline ...] --messages <file> [--messages ...] [--max-run-min 35] [--timeout-min 90] [--now <iso>]');
    process.exit(64);
  }
  const events = files.flatMap((f) => parsePipelineEvents(fs.readFileSync(f, 'utf8'))).sort((x, y) => x.at - y.at);
  const decision = decideDeploy(events, {
    pipelines,
    mergedAt,
    now: opt('--now') ? Date.parse(opt('--now')) : Date.now(),
    maxRunMin: opt('--max-run-min') ? Number(opt('--max-run-min')) : DEFAULT_MAX_RUN_MIN,
    timeoutMin: opt('--timeout-min') ? Number(opt('--timeout-min')) : DEFAULT_TIMEOUT_MIN,
  });
  console.log(JSON.stringify(decision, null, 2));
  process.exit({ deployed: 0, waiting: 2 }[decision.state] || 1);
}

module.exports = { parsePipelineEvents, pipelineTime, decidePipeline, decideDeploy, pickPipelines };
