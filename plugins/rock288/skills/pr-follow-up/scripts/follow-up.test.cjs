#!/usr/bin/env node
/**
 * Test suite for pr-review-state.cjs, follow-up-state.cjs and deploy-signal.cjs
 * Run: node plugins/rock288/skills/pr-follow-up/scripts/follow-up.test.cjs
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parsePrRef, summarizePullRequest } = require('./pr-review-state.cjs');
const { createStore, MAX_FIX_ROUNDS } = require('./follow-up-state.cjs');
const { parsePipelineEvents, decideDeploy, pickPipelines } = require('./deploy-signal.cjs');

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
    console.log(`    ${error.message}`);
  }
}

// ---------- pr-review-state ----------
console.log('\npr-review-state');

const HEAD = 'abc123';
function pr(overrides = {}) {
  return {
    url: 'https://github.com/Everfit-io/challenger-service/pull/259',
    state: 'OPEN',
    isDraft: false,
    mergedAt: null,
    mergeCommit: null,
    headRefOid: HEAD,
    baseRefName: 'develop',
    reviewDecision: null,
    mergeStateStatus: 'CLEAN',
    author: { login: 'me' },
    reviews: { nodes: [] },
    comments: { nodes: [] },
    reviewThreads: { nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS', contexts: { nodes: [{ name: 'ci', conclusion: 'SUCCESS' }] } } } }] },
    ...overrides,
  };
}
const review = (login, state, at, oid = HEAD, body = '') => ({ author: { login }, state, submittedAt: at, body, url: `r-${login}`, commit: { oid } });

test('parsePrRef reads owner/repo#n and PR urls', () => {
  assert.deepStrictEqual(parsePrRef('Everfit-io/challenger-service#259'), { owner: 'Everfit-io', name: 'challenger-service', number: 259 });
  assert.deepStrictEqual(parsePrRef('https://github.com/Everfit-io/everfit-microservices/pull/5218'), { owner: 'Everfit-io', name: 'everfit-microservices', number: 5218 });
  assert.throws(() => parsePrRef('PR 259'));
});

test('no reviews: in_review, not merge ready', () => {
  const s = summarizePullRequest(pr());
  assert.strictEqual(s.phase, 'in_review');
  assert.strictEqual(s.merge_ready, false);
});

test('approval on head + green CI: approved and merge ready', () => {
  const s = summarizePullRequest(pr({ reviewDecision: 'APPROVED', reviews: { nodes: [review('quang', 'APPROVED', '2026-10-27T07:00:00Z')] } }));
  assert.strictEqual(s.phase, 'approved');
  assert.strictEqual(s.merge_ready, true);
});

test('approval on an older commit does not pass approval_on_head', () => {
  const s = summarizePullRequest(pr({ reviewDecision: 'APPROVED', reviews: { nodes: [review('quang', 'APPROVED', '2026-10-27T07:00:00Z', 'old')] } }));
  assert.strictEqual(s.gate.approval_on_head.ok, false);
  assert.strictEqual(s.merge_ready, false);
});

test('a later COMMENTED review keeps the earlier CHANGES_REQUESTED verdict', () => {
  const s = summarizePullRequest(pr({ reviews: { nodes: [review('long', 'CHANGES_REQUESTED', '2026-10-27T07:00:00Z', HEAD, 'fix x'), review('long', 'COMMENTED', '2026-10-27T08:00:00Z', HEAD, 'also y')] } }));
  assert.strictEqual(s.phase, 'changes_requested');
});

test('a red required check or a branch behind base blocks the merge; a red optional check does not', () => {
  const approved = { reviewDecision: 'APPROVED', reviews: { nodes: [review('quang', 'APPROVED', '2026-10-27T07:00:00Z')] } };
  const withChecks = (nodes) => pr({ ...approved, mergeStateStatus: 'UNSTABLE', commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE', contexts: { nodes } } } }] } });
  const stg = { name: 'challenger-service-stg-us-w-2-cicd-codebuild-wildcard-trigger', conclusion: 'FAILURE', isRequired: false };
  const optionalRed = summarizePullRequest(withChecks([stg, { name: 'ci', conclusion: 'SUCCESS', isRequired: true }]));
  assert.strictEqual(optionalRed.gate.ci_green.ok, true);
  assert.strictEqual(optionalRed.merge_ready, true);
  const red = summarizePullRequest(withChecks([stg, { name: 'ci', conclusion: 'FAILURE', isRequired: true }]));
  assert.strictEqual(red.gate.ci_green.ok, false);
  const pending = summarizePullRequest(withChecks([{ name: 'ci', conclusion: null, status: 'IN_PROGRESS', isRequired: true }]));
  assert.strictEqual(pending.gate.ci_green.ok, false);
  const behind = summarizePullRequest(pr({ ...approved, mergeStateStatus: 'BEHIND' }));
  assert.strictEqual(behind.gate.up_to_date.ok, false);
});

test('new feedback skips our own replies and anything before --since', () => {
  const threads = { nodes: [{ isResolved: false, isOutdated: false, path: 'a.go', line: 3, comments: { nodes: [
    { author: { login: 'long' }, body: 'old point', createdAt: '2026-10-27T06:00:00Z', url: 'c1' },
    { author: { login: 'me' }, body: 'answer', createdAt: '2026-10-27T06:30:00Z', url: 'c2' },
    { author: { login: 'long' }, body: 'new point', createdAt: '2026-10-27T08:00:00Z', url: 'c3' },
  ] } }] };
  const s = summarizePullRequest(pr({ reviewThreads: threads }), { since: '2026-10-27T07:00:00Z', self: 'me' });
  assert.deepStrictEqual(s.new_feedback.map((f) => f.body), ['new point']);
  assert.strictEqual(s.open_threads[0].awaiting_our_reply, true);
});

test('merged PR reports merged with its merge commit', () => {
  const s = summarizePullRequest(pr({ state: 'MERGED', mergedAt: '2026-10-27T07:30:00Z', mergeCommit: { oid: 'm1' } }));
  assert.strictEqual(s.phase, 'merged');
  assert.strictEqual(s.merge_commit, 'm1');
  assert.strictEqual(s.merge_ready, false);
});

// ---------- follow-up-state ----------
console.log('\nfollow-up-state');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-follow-up-'));
let clock = 0;
const store = createStore(TMP, () => `2026-10-27T07:0${clock++}:00.000Z`);
const REF = 'https://github.com/Everfit-io/challenger-service/pull/259';

test('init writes the state under rk-trust/follow-up', () => {
  const s = store.init(REF, { ticket: 'CHAL-862', pipelines: ['challenger-service-dev-ap-se-1-cicd-codepipeline'], max_run_min: 15, dev_check: undefined });
  assert.strictEqual(s.pr, 'Everfit-io/challenger-service#259');
  assert.strictEqual(s.phase, 'in_review');
  assert.ok(!('dev_check' in s));
  assert.ok(fs.existsSync(path.join(TMP, 'rk-trust', 'follow-up', 'Everfit-io-challenger-service-259.json')));
});

test('start returns the previous run as since', () => {
  assert.strictEqual(store.start(REF).since, null);
  const firstRunAt = store.get(REF).last_run_at;
  assert.strictEqual(store.start(REF).since, firstRunAt);
});

test('start reports idle_hours since last_activity_at', () => {
  store.set(REF, ['last_activity_at=2026-10-26T07:00:00.000Z']);
  assert.strictEqual(store.start(REF).idle_hours, 24.1);
});

test('init again keeps phase and rounds, adds new fields', () => {
  store.set(REF, ['phase=merged', 'fix_rounds=2']);
  const s = store.init(REF, { slack_thread_ts: '1793082985.196969' });
  assert.strictEqual(s.phase, 'merged');
  assert.strictEqual(s.fix_rounds, 2);
  assert.strictEqual(s.slack_thread_ts, '1793082985.196969');
});

test('round escalates past MAX_FIX_ROUNDS', () => {
  store.set(REF, [`fix_rounds=${MAX_FIX_ROUNDS - 1}`]);
  assert.strictEqual(store.round(REF).escalate, false);
  assert.strictEqual(store.round(REF).escalate, true);
});

test('list hides done follow-ups', () => {
  assert.strictEqual(store.list().length, 1);
  store.set(REF, ['phase=done']);
  assert.strictEqual(store.list().length, 0);
});

fs.rmSync(TMP, { recursive: true, force: true });

// ---------- deploy-signal ----------
console.log('\ndeploy-signal');

const PIPE = 'challenger-service-dev-ap-se-1-cicd-codepipeline';
const MERGED = Date.parse('2026-10-27T02:40:00Z');
const at = (min) => (MERGED + min * 60000) / 1000;
const msg = (min, pipeline, status) => ({ ts: String(at(min)), text: `:x: *AWS CodePipeline Notification*\n\n${pipeline}  *${status}*\n*Application   :* x` });

test('parses the read_channel text format and the JSON array', () => {
  const text = `=== Message from bot (U00) ===\nMessage TS: ${at(1)}\n${PIPE}  *STARTED*\n=== Message from bot (U00) ===\nMessage TS: ${at(9)}\n${PIPE}  *SUCCEEDED*\n`;
  const fromText = parsePipelineEvents(JSON.stringify({ messages: text }));
  assert.deepStrictEqual(fromText.map((e) => e.status), ['STARTED', 'SUCCEEDED']);
  const fromJson = parsePipelineEvents(JSON.stringify([msg(9, PIPE, 'SUCCEEDED'), msg(1, PIPE, 'STARTED')]));
  assert.deepStrictEqual(fromJson.map((e) => e.status), ['STARTED', 'SUCCEEDED']);
});

test('a success inside max-run with no STARTED seen after the merge is not proof yet', () => {
  const events = parsePipelineEvents(JSON.stringify([msg(9, PIPE, 'SUCCEEDED')]));
  const d = decideDeploy(events, { pipelines: [PIPE], mergedAt: MERGED, now: MERGED + 20 * 60000, maxRunMin: 15 });
  assert.strictEqual(d.state, 'waiting');
});

test('paired: a run started after the merge proves it when it succeeds, without waiting max-run', () => {
  const events = parsePipelineEvents(JSON.stringify([msg(1, PIPE, 'STARTED'), msg(7, PIPE, 'SUCCEEDED')]));
  const d = decideDeploy(events, { pipelines: [PIPE], mergedAt: MERGED, now: MERGED + 8 * 60000, maxRunMin: 15 });
  assert.strictEqual(d.state, 'deployed');
  assert.strictEqual(d.deployed_by, new Date(at(7) * 1000).toISOString());
});

test('paired: our run failed and nothing restarted → failed at once; a restart keeps waiting', () => {
  const failedRun = parsePipelineEvents(JSON.stringify([msg(1, PIPE, 'STARTED'), msg(7, PIPE, 'FAILED')]));
  assert.strictEqual(decideDeploy(failedRun, { pipelines: [PIPE], mergedAt: MERGED, now: MERGED + 8 * 60000, maxRunMin: 15 }).state, 'failed');
  const retried = parsePipelineEvents(JSON.stringify([msg(1, PIPE, 'STARTED'), msg(7, PIPE, 'FAILED'), msg(9, PIPE, 'STARTED')]));
  assert.strictEqual(decideDeploy(retried, { pipelines: [PIPE], mergedAt: MERGED, now: MERGED + 10 * 60000, maxRunMin: 15 }).state, 'waiting');
});

// PR #258 (Everfit-io/challenger-service), merged 2026-10-27 09:48:45 +07: the bot messages as slack_read_channel returned them.
const PR258 = [
  ['1793069313.168989', 'challenger-service-dev-ap-se-1-cicd-codepipeline', 'STARTED', '09:48:23'],
  ['1793069338.684019', 'challenger-notif-dev-ap-se-1-cicd-codepipeline', 'STARTED', '09:48:49'],
  ['1793069347.577269', 'challenger-service-dev-ap-se-1-cicd-codepipeline', 'STARTED', '09:48:49'],
  ['1793069629.426649', 'challenger-service-dev-ap-se-1-cicd-codepipeline', 'SUCCEEDED', '09:53:39'],
  ['1793069720.988509', 'challenger-notif-dev-ap-se-1-cicd-codepipeline', 'SUCCEEDED', '09:55:10'],
  ['1793069815.052099', 'challenger-service-dev-ap-se-1-cicd-codepipeline', 'SUCCEEDED', '09:56:44'],
].map(([ts, pipeline, status, time]) => `=== Message from  (B06KLB7JJHY) at 2026-10-27 ${time} +07 === \nMessage TS: ${ts}\n\nAttachment: x\n\n\n${pipeline}  *${status}*\n*Environment :* develop         *Time :* 2026-10-27 ${time} GMT+7\n`).join('\n');
const PR258_MERGED = Date.parse('2026-10-27T02:48:45Z');

test('PR #258: notif deployed 09:55:10 (no later merge to wait for)', () => {
  const events = parsePipelineEvents(JSON.stringify({ messages: `Channel: #non-prod-ci-cd\n\n${PR258}` }));
  assert.strictEqual(events[0].at, Date.parse('2026-10-27T02:48:23Z'), 'event time comes from *Time :*');
  const d = decideDeploy(events, { pipelines: ['challenger-notif-dev-ap-se-1-cicd-codepipeline'], mergedAt: PR258_MERGED, now: Date.parse('2026-10-27T03:00:00Z'), maxRunMin: 15 });
  assert.strictEqual(d.state, 'deployed');
  assert.strictEqual(d.deployed_by, '2026-10-27T02:55:10.000Z');
});

test('PR #258: service skips the 09:53:39 success of the run already in flight, deployed 09:56:44', () => {
  const events = parsePipelineEvents(PR258);
  const at0955 = Date.parse('2026-10-27T02:55:00Z');
  const d = decideDeploy(events.filter((e) => e.at <= at0955), { pipelines: ['challenger-service-dev-ap-se-1-cicd-codepipeline'], mergedAt: PR258_MERGED, now: at0955, maxRunMin: 15 });
  assert.strictEqual(d.state, 'waiting', 'at 09:55 only the in-flight run has finished');
  const later = decideDeploy(events, { pipelines: ['challenger-service-dev-ap-se-1-cicd-codepipeline'], mergedAt: PR258_MERGED, now: Date.parse('2026-10-27T03:00:00Z'), maxRunMin: 15 });
  assert.strictEqual(later.state, 'deployed');
  assert.strictEqual(later.deployed_by, '2026-10-27T02:56:44.000Z');
});

test('a success after max-run proves the deploy', () => {
  const events = parsePipelineEvents(JSON.stringify([msg(9, PIPE, 'SUCCEEDED'), msg(17, PIPE, 'SUCCEEDED')]));
  const d = decideDeploy(events, { pipelines: [PIPE], mergedAt: MERGED, now: MERGED + 20 * 60000, maxRunMin: 15 });
  assert.strictEqual(d.state, 'deployed');
  assert.strictEqual(d.deployed_by, new Date(at(17) * 1000).toISOString());
});

test('other pipelines and runs before the merge do not count', () => {
  const events = parsePipelineEvents(JSON.stringify([msg(-30, PIPE, 'SUCCEEDED'), msg(20, 'marketplace-cms-dev-codepipeline', 'SUCCEEDED')]));
  const d = decideDeploy(events, { pipelines: [PIPE], mergedAt: MERGED, now: MERGED + 25 * 60000, maxRunMin: 15 });
  assert.strictEqual(d.state, 'waiting');
});

test('several pipelines: deployed only when every one is', () => {
  const OTHER = 'em-dev-us-w-2-marketplace-api-dev-api-cicd-codepipeline';
  const events = parsePipelineEvents(JSON.stringify([msg(17, PIPE, 'SUCCEEDED')]));
  assert.strictEqual(decideDeploy(events, { pipelines: [PIPE, OTHER], mergedAt: MERGED, now: MERGED + 20 * 60000, maxRunMin: 15 }).state, 'waiting');
  const both = parsePipelineEvents(JSON.stringify([msg(17, PIPE, 'SUCCEEDED'), msg(18, OTHER, 'SUCCEEDED')]));
  assert.strictEqual(decideDeploy(both, { pipelines: [PIPE, OTHER], mergedAt: MERGED, now: MERGED + 20 * 60000, maxRunMin: 15 }).state, 'deployed');
});

test('past the timeout: failed when a run failed, timeout otherwise', () => {
  const failedRun = parsePipelineEvents(JSON.stringify([msg(10, PIPE, 'FAILED')]));
  assert.strictEqual(decideDeploy(failedRun, { pipelines: [PIPE], mergedAt: MERGED, now: MERGED + 100 * 60000, maxRunMin: 15 }).state, 'failed');
  assert.strictEqual(decideDeploy([], { pipelines: [PIPE], mergedAt: MERGED, now: MERGED + 100 * 60000, maxRunMin: 15 }).state, 'timeout');
});

test('pickPipelines: longest prefix wins, "*" covers the rest, lists merge', () => {
  const SVC = 'challenger-service-dev-ap-se-1-cicd-codepipeline';
  const NOTIF = 'challenger-notif-dev-ap-se-1-cicd-codepipeline';
  const map = { 'apps/notification/': NOTIF, 'apps/challenger/': SVC, '*': [SVC, NOTIF] };
  assert.deepStrictEqual(pickPipelines(map, ['apps/challenger/internal/a.go']), [SVC]);
  assert.deepStrictEqual(pickPipelines(map, ['apps/notification/x.go', 'apps/challenger/y.go']), [NOTIF, SVC].sort());
  assert.deepStrictEqual(pickPipelines(map, ['libs/platform/z.go']), [NOTIF, SVC].sort());
  assert.deepStrictEqual(pickPipelines({ 'apps/auth/': 'auth-dev' }, ['docs/readme.md']), []);
});

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
