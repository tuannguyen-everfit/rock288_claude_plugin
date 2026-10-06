#!/usr/bin/env node
/**
 * Test suite for git-activity.cjs
 * Run: node plugins/rock288/skills/ef-logwork/scripts/git-activity.test.cjs
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, 'git-activity.cjs');
const lib = require(SCRIPT_PATH);

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

// ============================================
// FIXTURE — temp repos with controlled dates
// ============================================
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-logwork-'));
const ROOT = path.join(TMP, 'src');
const ME = 'me@everfit.io';
const emptyGitConfig = path.join(TMP, 'gitconfig');
fs.writeFileSync(emptyGitConfig, '');
fs.mkdirSync(ROOT);

// Isolate from the user's global git config (signing, hooks, default branch …).
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: emptyGitConfig, GIT_CONFIG_NOSYSTEM: '1' };

function git(repo, args, env = {}) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8', env: { ...GIT_ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo(name) {
  const repo = path.join(ROOT, name);
  fs.mkdirSync(repo);
  git(repo, ['init', '-q', '-b', 'develop']);
  git(repo, ['config', 'user.email', ME]);
  git(repo, ['config', 'user.name', 'Me']);
  return repo;
}

function commit(repo, subject, authorDate, { committerDate = authorDate, email = ME } = {}) {
  git(repo, ['commit', '-q', '--allow-empty', '-m', subject], {
    GIT_AUTHOR_DATE: authorDate,
    GIT_COMMITTER_DATE: committerDate,
    GIT_AUTHOR_EMAIL: email,
    GIT_AUTHOR_NAME: email === ME ? 'Me' : 'Other',
  });
}

const api = makeRepo('api');
commit(api, 'chore: init', '2026-10-01T10:00:00+07:00');
commit(api, 'fix(truecoach): UP-79399 key prescription cache (#121)', '2026-10-06T08:00:00+07:00');
commit(api, 'feat(staging): UP-79336 late evening', '2026-10-05T23:30:00+07:00');
commit(api, 'feat(staging): UP-79336 just after midnight', '2026-10-07T00:10:00+07:00');
commit(api, 'feat(sync): UP-80001 written in LA', '2026-10-05T18:00:00-07:00');
commit(api, 'fix(rebase): UP-80002 rebased later', '2026-10-06T11:00:00+07:00', { committerDate: '2026-10-08T15:00:00+07:00' });
commit(api, 'feat(other): UP-80003 someone else', '2026-10-06T12:00:00+07:00', { email: 'other@everfit.io' });
commit(api, 'chore: bump deps', '2026-10-06T13:00:00+07:00');
commit(api, 'docs: UTF-8 note', '2026-10-06T13:10:00+07:00');
// Branch whose card lives only in the branch name; merged back with a merge commit.
git(api, ['checkout', '-q', '-b', 'dev_s18_26.feat/CHAL-399']);
commit(api, 'add leaderboard cache', '2026-10-06T14:00:00+07:00');
commit(api, 'tune leaderboard ttl', '2026-10-06T14:30:00+07:00');
git(api, ['checkout', '-q', 'develop']);
git(api, ['merge', '-q', '--no-ff', '-m', 'Merge branch CHAL-399 into develop', 'dev_s18_26.feat/CHAL-399'], {
  GIT_AUTHOR_DATE: '2026-10-06T15:00:00+07:00', GIT_COMMITTER_DATE: '2026-10-06T15:00:00+07:00',
});

// Fork repeating the same subject (everfit-api ↔ metric-service).
const fork = makeRepo('metric');
commit(fork, 'fix(truecoach): UP-79399 key prescription cache', '2026-10-06T09:30:00+07:00');

// Card-less develop commits below a feature fork. The feature tip is the newest commit, so
// `--source` (newest-first walk) labels them with the feature ref — but they are first-parent
// develop history → they must stay unmatched.
const leak = makeRepo('leak');
commit(leak, 'base', '2026-10-06T08:00:00+07:00');
commit(leak, 'fix typo in readme', '2026-10-06T09:00:00+07:00');
git(leak, ['checkout', '-q', '-b', 'dev_s18_26.feat/UP-200']);
commit(leak, 'add endpoint', '2026-10-06T11:00:00+07:00');
git(leak, ['checkout', '-q', 'develop']);
commit(leak, 'later develop work', '2026-10-06T10:00:00+07:00');

// Stacked branches: UP-201 forked from UP-100, then UP-100 squash-merged + deleted — its
// commits are now reachable only via UP-201, so `--source` labels them UP-201. Once UP-201 has
// a subject commit, only subject commits feed its description.
const stack = makeRepo('stack');
commit(stack, 'chore: stack base', '2026-10-01T08:00:00+07:00');
git(stack, ['checkout', '-q', '-b', 'dev_s18_26.feat/UP-100']);
commit(stack, 'parent groundwork', '2026-10-06T08:30:00+07:00');
commit(stack, 'parent tip', '2026-10-06T09:00:00+07:00');
git(stack, ['checkout', '-q', '-b', 'dev_s18_26.feat/UP-201']);
commit(stack, 'feat: UP-201 child work', '2026-10-06T10:00:00+07:00');
commit(stack, 'child polish', '2026-10-06T11:00:00+07:00');
git(stack, ['branch', '-q', '-D', 'dev_s18_26.feat/UP-100']);
// Author email differing only in case from user.email.
commit(stack, 'feat: UP-80004 upper-case email', '2026-10-06T12:00:00+07:00', { email: 'ME@Everfit.io' });

fs.mkdirSync(path.join(ROOT, 'not-a-repo'));

function runCli(args) {
  try {
    const stdout = execFileSync('node', [SCRIPT_PATH, ...args], { encoding: 'utf-8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    return { exitCode: 0, json: JSON.parse(stdout), stderr: '' };
  } catch (error) {
    return { exitCode: error.status, json: null, stderr: (error.stderr || '').toString() };
  }
}

const day = runCli(['--date=2026-10-06', `--roots=${ROOT}`, '--no-reviews']);
const card = key => (day.json.cards || []).find(c => c.card === key);
const allSubjects = () => [
  ...day.json.cards.flatMap(c => c.commits.map(x => x.subject)),
  ...day.json.unmatched.map(x => x.subject),
];

// ============================================
// CLI — day window + tz
// ============================================
console.log('\n📅 Day window + timezone');

test('CLI exits 0 with JSON shape', () => {
  assertEqual(day.exitCode, 0, 'exit code');
  for (const k of ['date', 'tz', 'cards', 'reviews', 'unmatched', 'errors']) assert(k in day.json, `missing key ${k}`);
  assertEqual(day.json.date, '2026-10-06', 'date');
  assertEqual(day.json.tz, '+07:00', 'tz');
});

test('2026-10-06T08:00 +07:00 included', () => {
  assert(card('UP-79399'), 'UP-79399 should be present');
});

test('2026-10-05T23:30 and 2026-10-07T00:10 +07:00 excluded', () => {
  assert(!card('UP-79336'), 'UP-79336 commits are outside the VN day');
});

test('2026-10-05T18:00-07:00 (= 10-06 08:00 VN) included and shown in +07:00', () => {
  const c = card('UP-80001');
  assert(c, 'UP-80001 should be present');
  assertEqual(c.firstAt, '2026-10-06T08:00:00+07:00', 'firstAt converted to VN');
});

test('author 10-06, committer 10-08 (rebased) included', () => {
  assert(card('UP-80002'), 'UP-80002 should be bucketed by author date');
});

// ============================================
// CLI — card extraction, filtering, dedupe
// ============================================
console.log('\n🃏 Cards, authors, dedupe');

test('card from subject', () => {
  assertEqual(card('UP-79399').types, ['fix'], 'types');
  assertEqual(card('UP-79399').mergedPrs, [121], 'mergedPrs');
});

test('card from branch ref only', () => {
  const c = card('CHAL-399');
  assert(c, 'CHAL-399 should come from the branch name');
  assertEqual(c.subjects, ['add leaderboard cache', 'tune leaderboard ttl'], 'subjects');
  assertEqual(c.cardFrom, 'branch', 'cardFrom');
  assertEqual(card('UP-79399').cardFrom, 'subject', 'subject cardFrom');
});

test('develop commits around a feature fork do not inherit the branch card', () => {
  assertEqual(card('UP-200').subjects, ['add endpoint'], 'only the branch commit');
  const subjects = day.json.unmatched.map(u => u.subject);
  assert(subjects.includes('base') && subjects.includes('fix typo in readme'), 'develop commits unmatched');
});

test('stacked branch: subjects only from subject commits; per-commit cardFrom kept', () => {
  const c = card('UP-201');
  assertEqual(c.cardFrom, 'subject', 'cardFrom');
  assertEqual(c.subjects, ['child work'], 'subjects');
  assert(c.commits.some(x => x.subject === 'parent groundwork' && x.cardFrom === 'branch'), 'leaked commit tagged branch');
});

test('author email matched case-insensitively', () => {
  assert(card('UP-80004'), 'UP-80004 by ME@Everfit.io should be mine');
});

test('--projects limits card keys (CHAL dropped when only UP allowed)', () => {
  const r = runCli(['--date=2026-10-06', `--roots=${ROOT}`, '--no-reviews', '--projects=UP']);
  assert(!r.json.cards.some(c => c.card.startsWith('CHAL-')), 'no CHAL cards');
  assert(r.json.unmatched.some(u => u.subject === 'add leaderboard cache'), 'CHAL commit unmatched');
});

test('no card → unmatched (UTF-8 is not a card)', () => {
  const subjects = day.json.unmatched.map(u => u.subject);
  assert(subjects.includes('chore: bump deps'), 'bump deps unmatched');
  assert(subjects.includes('docs: UTF-8 note'), 'UTF-8 note unmatched');
  assert(!card('UTF-8'), 'UTF-8 must not be a card');
});

test("other author's commit excluded", () => {
  assert(!card('UP-80003'), 'UP-80003 belongs to another author');
});

test('merge commit excluded', () => {
  assert(!allSubjects().some(s => s.startsWith('Merge branch')), 'merge commit leaked');
});

test('same subject in 2 repos → 1 subject, 2 repos', () => {
  const c = card('UP-79399');
  assertEqual(c.subjects, ['key prescription cache'], 'subjects deduped');
  assertEqual([...c.repos].sort(), ['api', 'metric'], 'repos');
  assertEqual(c.commits.length, 2, 'both commits kept');
});

test('cards sorted by firstAt', () => {
  const firsts = day.json.cards.map(c => c.firstAt);
  assertEqual(firsts, [...firsts].sort(), 'sorted');
});

// ============================================
// CLI — errors + usage
// ============================================
console.log('\n⚠️  Errors + usage');

test('missing root → errors[], exit 0', () => {
  const missing = path.join(TMP, 'missing');
  const r = runCli(['--date=2026-10-06', `--roots=${ROOT},${missing}`, '--no-reviews']);
  assertEqual(r.exitCode, 0, 'exit code');
  assert(r.json.errors.some(e => e.root === missing && e.error === 'ENOENT'), 'ENOENT recorded');
  assert(r.json.cards.length === day.json.cards.length, 'other roots still collected');
});

test('--date=2026-13-01 → exit 2', () => {
  const r = runCli(['--date=2026-13-01', `--roots=${ROOT}`, '--no-reviews']);
  assertEqual(r.exitCode, 2, 'exit code');
  assert(r.stderr.includes('Invalid --date'), 'usage message on stderr');
});

test('unknown flag → exit 2', () => {
  assertEqual(runCli(['--bogus']).exitCode, 2, 'exit code');
});

test('--tz=+99:99 → exit 2', () => {
  assertEqual(runCli(['--tz=+99:99', `--roots=${ROOT}`, '--no-reviews']).exitCode, 2, 'exit code');
});

// ============================================
// CLI — PR reviews through a stub `gh` on PATH
// ============================================
console.log('\n👀 PR reviews (stub gh)');

const BIN = path.join(TMP, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'gh'), `#!/usr/bin/env node
const a = process.argv.slice(2).join(' ');
const fail = msg => { process.stderr.write(msg + '\\n'); process.exit(1); };
if (process.env.FAKE_GH_FAIL) fail('auth required');
if (a === 'api user --jq .login') console.log('me-gh');
else if (a.startsWith('search prs --reviewed-by=@me --updated=>=2026-10-05 ')) console.log(JSON.stringify([
  { number: 7, title: 'feat(x): UP-70000 thing', repository: { nameWithOwner: 'org/repo' }, author: { login: 'alice' } },
  { number: 8, title: 'fix: UP-70001 gone', repository: { nameWithOwner: 'org/repo' }, author: { login: 'alice' } },
]));
else if (a.includes('repos/org/repo/pulls/7/reviews')) console.log('me-gh\\tCHANGES_REQUESTED\\t2026-10-06T03:00:00Z\\nbob\\tAPPROVED\\t2026-10-06T04:00:00Z');
else if (a.includes('repos/org/repo/pulls/8/reviews')) fail('HTTP 404: Not Found');
else fail('unexpected: ' + a);
`, { mode: 0o755 });

function runWithStubGh(env = {}) {
  const stdout = execFileSync('node', [SCRIPT_PATH, '--date=2026-10-06', `--roots=${ROOT}`], {
    encoding: 'utf-8', env: { ...GIT_ENV, PATH: `${BIN}${path.delimiter}${process.env.PATH}`, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

test('reviews: my review kept with card + VN time; failed PR fetch → errors[]', () => {
  const r = runWithStubGh();
  assertEqual(r.reviews, [{
    card: 'UP-70000', repo: 'org/repo', pr: 7, title: 'feat(x): UP-70000 thing',
    state: 'CHANGES_REQUESTED', at: '2026-10-06T10:00:00+07:00',
  }], 'reviews');
  assert(r.errors.some(e => e.source === 'gh' && e.pr === 8 && e.error.includes('404')), '404 recorded');
  assertEqual(r.cards.length, day.json.cards.length, 'git cards unaffected');
});

test('gh auth failure → errors[], exit 0, git cards still returned', () => {
  const r = runWithStubGh({ FAKE_GH_FAIL: '1' });
  assertEqual(r.reviews, [], 'no reviews');
  assert(r.errors.some(e => e.source === 'gh' && e.error.includes('gh api user failed')), 'gh error recorded');
  assertEqual(r.cards.length, day.json.cards.length, 'git cards unaffected');
});

// ============================================
// PURE FUNCTIONS
// ============================================
console.log('\n🧪 Pure functions');

test('parseArgs defaults date to today in tz', () => {
  // 2026-10-06T20:00Z = 2026-10-07 03:00 VN
  const opts = lib.parseArgs(['--roots=/x'], Date.parse('2026-10-06T20:00:00Z'));
  assertEqual(opts.date, '2026-10-07', 'VN date');
  assertEqual(opts.reviews, true, 'reviews on by default');
});

test('parseArgs rejects bad tz', () => {
  let threw = false;
  try { lib.parseArgs(['--tz=7']); } catch (e) { threw = e instanceof lib.UsageError; }
  assert(threw, 'should throw UsageError');
});

test('vnDayWindow is a half-open 24h window', () => {
  const w = lib.vnDayWindow('2026-10-06', '+07:00');
  assertEqual(new Date(w.startMs).toISOString(), '2026-10-05T17:00:00.000Z', 'start');
  assertEqual(w.endMs - w.startMs, 86400000, 'length');
});

test("stripSubject('fix(truecoach): UP-79399 key cache (#121)') → 'key cache'", () => {
  assertEqual(lib.stripSubject('fix(truecoach): UP-79399 key cache (#121)', 'UP-79399'), 'key cache');
  assertEqual(lib.stripSubject('[UP-1] feat!: x', 'UP-1'), 'feat!: x', 'bracketed card at start');
  assertEqual(lib.stripSubject('UP-1 vs UP-12', 'UP-1'), 'vs UP-12', 'longer key untouched');
});

test('extractCard prefers subject over refs', () => {
  assertEqual(lib.extractCard('UP-1 thing', 'dev_s18_26.feat/CHAL-2'), 'UP-1');
  assertEqual(lib.extractCard('thing', 'HEAD -> dev_s18_26.feat/CHAL-2-slug'), 'CHAL-2');
  assertEqual(lib.extractCard('SHA-256 hashing', ''), null);
  assertEqual(lib.extractCard('', 'feat/UP-300_cache'), 'UP-300', 'key before underscore');
  assertEqual(lib.extractCard('xUP-1 thing', ''), null, 'key glued to a word');
});

test('extractCard with projects skips foreign keys instead of stopping at them', () => {
  assertEqual(lib.extractCard('fix: PR-12 UP-123 thing', '', ['UP']), 'UP-123');
  assertEqual(lib.extractCard('bump GPT-4 client', '', ['UP', 'CHAL']), null);
});

test('bucketReviews: other login, out of window, own PR dropped; latest per PR kept', () => {
  const w = lib.vnDayWindow('2026-10-06', '+07:00');
  const base = { repo: 'Everfit-io/everfit-api', pr: 19731, title: 'fix(kmp): UP-76078 x', prAuthor: 'alice' };
  const out = lib.bucketReviews([
    { ...base, user: 'me', state: 'COMMENTED', at: '2026-10-06T03:00:00Z' },
    { ...base, user: 'me', state: 'APPROVED', at: '2026-10-06T08:00:00Z' },
    { ...base, user: 'bob', state: 'APPROVED', at: '2026-10-06T09:00:00Z' },
    { ...base, pr: 2, user: 'me', state: 'APPROVED', at: '2026-10-06T18:00:00Z' }, // 10-07 01:00 VN
    { ...base, pr: 3, prAuthor: 'me', user: 'me', state: 'COMMENTED', at: '2026-10-06T04:00:00Z' },
    { ...base, pr: 4, user: 'me', state: 'PENDING', at: '' },
  ], 'me', w);
  assertEqual(out.length, 1, 'one review kept');
  assertEqual(out[0].state, 'APPROVED', 'latest state');
  assertEqual(out[0].card, 'UP-76078', 'card from title');
  assertEqual(out[0].at, '2026-10-06T15:00:00+07:00', 'at in VN');
});

test('bucketReviews: a later thread reply does not downgrade an approval', () => {
  const w = lib.vnDayWindow('2026-10-06', '+07:00');
  const base = { repo: 'org/repo', pr: 1, title: 'feat: UP-1 x', prAuthor: 'alice', user: 'me' };
  const out = lib.bucketReviews([
    { ...base, state: 'APPROVED', at: '2026-10-06T03:00:00Z' },
    { ...base, state: 'COMMENTED', at: '2026-10-06T05:00:00Z' },
  ], 'me', w);
  assertEqual(out.map(r => r.state), ['APPROVED'], 'verdict kept');
});

// ============================================
// SUMMARY
// ============================================
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
