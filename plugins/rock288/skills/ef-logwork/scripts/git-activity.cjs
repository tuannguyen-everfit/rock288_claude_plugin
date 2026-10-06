#!/usr/bin/env node
/**
 * Git activity collector for ef-logwork
 * "What did I touch on VN day X?" → JSON of cards (from my commits) + PR reviews I submitted.
 *
 * Usage: node git-activity.cjs [options]
 * Options:
 *   --date=YYYY-MM-DD      Day to collect, in --tz (default: today in --tz)
 *   --tz=+07:00            Day timezone offset (default: +07:00, Asia/Saigon)
 *   --roots=a,b            Comma-separated dirs whose direct children are repos (default: ~/Source)
 *   --author=<email>       Commit author email (default: each repo's `git config user.email`)
 *   --projects=UP,CHAL     Only accept card keys of these Jira projects (default: any key)
 *   --no-reviews           Skip GitHub PR review collection
 *   --gh-login=<login>     GitHub login for reviews (default: `gh api user` / `@me`)
 *
 * Output (stdout): { date, tz, cards[], reviews[], unmatched[], errors[] } — never throws on a
 * bad repo; failures land in errors[]. Exit 0 on success, 2 on usage error.
 *
 * Day bucketing uses the AUTHOR date converted to --tz. `git log --since` filters on the
 * COMMITTER date, which rebase/amend pushes later — so the log is widened (since date-1, no
 * upper bound) and every commit is then bucketed precisely in JS.
 *
 * Card source: commit subject first, branch names (`%D` refs + `--source`) second. Branch
 * names are ignored for first-parent commits of develop/main/master: `--source` labels those
 * with whichever ref reached them first, often a feature branch forked later.
 */

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const DAY_MS = 24 * 60 * 60 * 1000;
// Not preceded by a letter/digit (so `feat/UP-1`, `_UP-1` match), not followed by a digit.
const CARD_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]+-\d+)(?!\d)/g;
// Uppercase-dash-digit tokens that are standards, not Jira keys (UTF-8, SHA-256, …).
const NON_CARD_PREFIXES = new Set(['UTF', 'ISO', 'SHA', 'HTTP', 'HTTPS', 'TLS', 'SSL', 'RFC', 'CVE', 'AES', 'RSA']);
const MAINLINE_REFS = ['refs/heads/develop', 'refs/heads/main', 'refs/heads/master',
  'refs/remotes/origin/develop', 'refs/remotes/origin/main', 'refs/remotes/origin/master'];
const FIELD_SEP = '\x1f';
const PR_SEARCH_LIMIT = 100;
const GH_CONCURRENCY = 8;

class UsageError extends Error {}

const USAGE = 'Usage: node git-activity.cjs [--date=YYYY-MM-DD] [--tz=+07:00] [--roots=~/Source,~/tuan] '
  + '[--author=<email>] [--projects=UP,CHAL] [--no-reviews] [--gh-login=<login>]';

function expandHome(p) {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

function tzOffsetMinutes(tz) {
  const sign = tz[0] === '-' ? -1 : 1;
  const [h, m] = tz.slice(1).split(':').map(Number);
  return sign * (h * 60 + m);
}

/** YYYY-MM-DD shifted by N calendar days (pure date arithmetic, tz-free). */
function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Epoch ms → ISO-8601 local time in tz, e.g. 2026-10-06T09:12:00+07:00. */
function toTzIso(ms, tz) {
  return new Date(ms + tzOffsetMinutes(tz) * 60000).toISOString().slice(0, 19) + tz;
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === date;
}

function parseArgs(argv, now = Date.now()) {
  const opts = { tz: '+07:00', roots: ['~/Source'], author: null, projects: null, reviews: true, ghLogin: null, date: null };
  const list = value => value.split(',').map(s => s.trim()).filter(Boolean);
  for (const arg of argv) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    if (key === '--date') opts.date = value;
    else if (key === '--tz') opts.tz = value;
    else if (key === '--roots') opts.roots = list(value);
    else if (key === '--author') opts.author = value;
    else if (key === '--projects') opts.projects = list(value).map(p => p.toUpperCase());
    else if (key === '--gh-login') opts.ghLogin = value;
    else if (arg === '--no-reviews') opts.reviews = false;
    else throw new UsageError(`Unknown argument: ${arg}`);
  }
  const tzMatch = opts.tz.match(/^[+-](\d{2}):(\d{2})$/);
  if (!tzMatch || Number(tzMatch[1]) > 14 || Number(tzMatch[2]) > 59) {
    throw new UsageError(`Invalid --tz: ${opts.tz} (expected +HH:MM, |offset| ≤ 14h)`);
  }
  if (opts.projects && opts.projects.length === 0) throw new UsageError('--projects is empty');
  if (opts.date === null) opts.date = toTzIso(now, opts.tz).slice(0, 10);
  if (!isValidDate(opts.date)) throw new UsageError(`Invalid --date: ${opts.date} (expected YYYY-MM-DD)`);
  if (opts.roots.length === 0) throw new UsageError('--roots is empty');
  opts.roots = opts.roots.map(expandHome);
  return opts;
}

/** Half-open [startMs, endMs) window of one calendar day in tz. */
function vnDayWindow(date, tz) {
  const startMs = Date.parse(`${date}T00:00:00${tz}`);
  return { startMs, endMs: startMs + DAY_MS, tz };
}

/** First Jira key in text — of an allowed project when `projects` is given — else null. */
function firstCard(text, projects) {
  for (const match of String(text || '').matchAll(CARD_RE)) {
    const project = match[1].split('-')[0];
    if (projects ? projects.includes(project) : !NON_CARD_PREFIXES.has(project)) return match[1];
  }
  return null;
}

/** First card in the subject, else in the refs (branch names). */
function extractCard(subject, refs = '', projects = null) {
  return firstCard(subject, projects) || firstCard(refs, projects);
}

/** Drop the `type(scope): ` prefix, the card ID and a trailing squash-merge `(#N)`. */
function stripSubject(subject, card) {
  let s = subject.replace(/^\w+(\([^)]*\))?!?:\s*/, '').replace(/\s*\(#\d+\)\s*$/, '');
  if (card) s = s.replace(new RegExp(`(?<![A-Za-z0-9])${card}(?!\\d)`, 'g'), ' ').replace(/\[\s*\]/g, ' ');
  return s.replace(/\s+/g, ' ').replace(/^[\s:–-]+/, '').trim();
}

function conventionalType(subject) {
  const m = subject.match(/^(\w+)(\([^)]*\))?!?:/);
  return m ? m[1].toLowerCase() : null;
}

function mergedPr(subject) {
  const m = subject.match(/\(#(\d+)\)\s*$/);
  return m ? Number(m[1]) : null;
}

/**
 * commits: [{ repo, sha, at (author ISO), subject, refs }] → { cards, unmatched }.
 * Keeps commits whose author date falls in the window; one entry per sha (worktrees/clones
 * of one repo see the same commits); subjects deduped per card (forks repeat them).
 * `cardFrom` = "subject" when any commit names the card in its subject, else "branch" (also
 * per commit). When subject commits exist, `subjects` come only from them — branch-derived
 * commits may belong to a stacked parent branch.
 */
function groupCommits(commits, window, { projects = null } = {}) {
  const tz = window.tz || '+07:00';
  const byCard = new Map();
  const unmatched = [];
  const seen = new Set();
  // Oldest first so subjects read in the order the work happened (git log is newest first).
  const ordered = commits
    .map(c => ({ ...c, ms: Date.parse(c.at) }))
    .filter(c => !Number.isNaN(c.ms) && c.ms >= window.startMs && c.ms < window.endMs)
    .sort((a, b) => a.ms - b.ms);
  for (const c of ordered) {
    const { ms } = c;
    if (seen.has(c.sha)) continue;
    seen.add(c.sha);
    const card = extractCard(c.subject, c.refs, projects);
    const sha = c.sha.slice(0, 7);
    if (!card) {
      unmatched.push({ repo: c.repo, sha, subject: c.subject });
      continue;
    }
    if (!byCard.has(card)) {
      byCard.set(card, { card, repos: [], firstMs: ms, lastMs: ms, bySource: { subject: [], branch: [] }, types: [], mergedPrs: [], commits: [] });
    }
    const g = byCard.get(card);
    const cardFrom = firstCard(c.subject, projects) === card ? 'subject' : 'branch';
    if (!g.repos.includes(c.repo)) g.repos.push(c.repo);
    g.firstMs = Math.min(g.firstMs, ms);
    g.lastMs = Math.max(g.lastMs, ms);
    const stripped = stripSubject(c.subject, card);
    const bucket = g.bySource[cardFrom];
    if (stripped && !bucket.some(s => s.toLowerCase() === stripped.toLowerCase())) bucket.push(stripped);
    const type = conventionalType(c.subject);
    if (type && !g.types.includes(type)) g.types.push(type);
    const pr = mergedPr(c.subject);
    if (pr && !g.mergedPrs.includes(pr)) g.mergedPrs.push(pr);
    g.commits.push({ repo: c.repo, sha, at: toTzIso(ms, tz), subject: c.subject, cardFrom });
  }
  const cards = [...byCard.values()]
    .sort((a, b) => a.firstMs - b.firstMs)
    .map(({ card, firstMs, lastMs, bySource, commits: list, ...rest }) => ({
      card,
      cardFrom: bySource.subject.length ? 'subject' : 'branch',
      ...rest,
      subjects: bySource.subject.length ? bySource.subject : bySource.branch,
      firstAt: toTzIso(firstMs, tz),
      lastAt: toTzIso(lastMs, tz),
      commits: list,
    }));
  return { cards, unmatched };
}

// A verdict outranks a later plain comment (a thread reply after approving is still "approved").
const reviewRank = state => (state === 'APPROVED' || state === 'CHANGES_REQUESTED' ? 1 : 0);

/**
 * reviews: [{ repo, pr, title, prAuthor, user, state, at }] → reviews `login` submitted inside
 * the window on someone else's PR, one per PR (latest verdict, else latest comment), by time.
 */
function bucketReviews(reviews, login, window, { projects = null } = {}) {
  const me = String(login || '').toLowerCase();
  const best = new Map();
  for (const r of reviews) {
    const ms = Date.parse(r.at);
    if (String(r.user || '').toLowerCase() !== me) continue;
    if (String(r.prAuthor || '').toLowerCase() === me) continue;
    if (!r.at || Number.isNaN(ms) || ms < window.startMs || ms >= window.endMs) continue;
    const key = `${r.repo}#${r.pr}`;
    const cur = best.get(key);
    const better = !cur
      || reviewRank(r.state) > reviewRank(cur.state)
      || (reviewRank(r.state) === reviewRank(cur.state) && Date.parse(cur.at) < ms);
    if (better) best.set(key, r);
  }
  return [...best.values()]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map(r => ({
      card: firstCard(r.title, projects),
      repo: r.repo,
      pr: r.pr,
      title: r.title,
      state: r.state,
      at: toTzIso(Date.parse(r.at), window.tz || '+07:00'),
    }));
}

// ---------- side-effecting collectors (CLI only) ----------

const EXEC_OPTS = { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 };
const execFileAsync = promisify(execFile);

function run(cmd, args) {
  return execFileSync(cmd, args, { ...EXEC_OPTS, stdio: ['ignore', 'pipe', 'pipe'] });
}

async function runAsync(cmd, args) {
  return (await execFileAsync(cmd, args, EXEC_OPTS)).stdout;
}

function firstLine(err) {
  return (err.stderr || err.message || '').toString().trim().split('\n')[0];
}

/** Each root itself (if a repo) + its direct children with a `.git` dir or file (worktrees). */
function discoverRepos(roots, errors) {
  const repos = [];
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (err) {
      errors.push({ root, error: err.code || err.message });
      continue;
    }
    if (fs.existsSync(path.join(root, '.git'))) repos.push(root);
    for (const e of entries) {
      const dir = path.join(root, e.name);
      if ((e.isDirectory() || e.isSymbolicLink()) && fs.existsSync(path.join(dir, '.git'))) repos.push(dir);
    }
  }
  return repos;
}

/** First-parent history of develop/main/master (local + origin) since `since`. */
function mainlineShas(repo, since) {
  const refs = run('git', ['-C', repo, 'for-each-ref', '--format=%(refname)', ...MAINLINE_REFS])
    .split('\n').filter(Boolean);
  if (refs.length === 0) return new Set();
  return new Set(run('git', ['-C', repo, 'rev-list', '--first-parent', `--since=${since}`, ...refs])
    .split('\n').filter(Boolean));
}

function collectCommits(repo, opts, errors) {
  const name = path.basename(repo);
  let email = opts.author;
  try {
    if (!email) email = run('git', ['-C', repo, 'config', 'user.email']).trim();
  } catch {
    email = '';
  }
  if (!email) {
    errors.push({ repo: name, error: 'no user.email (pass --author)' });
    return [];
  }
  const since = `${shiftDate(opts.date, -1)}T00:00:00${opts.tz}`;
  let out;
  let mainline;
  try {
    // --fixed-strings: the email is matched literally, whatever grep.patternType says.
    out = run('git', ['-C', repo, 'log', '--all', '--source', '--no-merges', '--fixed-strings',
      '--regexp-ignore-case', `--author=<${email}>`, `--since=${since}`,
      `--format=%H${FIELD_SEP}%aI${FIELD_SEP}%ae${FIELD_SEP}%s${FIELD_SEP}%D${FIELD_SEP}%S`]);
  } catch (err) {
    errors.push({ repo: name, error: firstLine(err) });
    return [];
  }
  try {
    mainline = out ? mainlineShas(repo, since) : new Set();
  } catch {
    mainline = new Set(); // best effort — worst case branch cards are not filtered for this repo
  }
  return out.split('\n').filter(Boolean).map(line => {
    const [sha, at, authorEmail, subject, refs, source] = line.split(FIELD_SEP);
    const branchRefs = mainline.has(sha) ? '' : [refs, source].filter(Boolean).join(', ');
    return { repo: name, sha, at, authorEmail, subject, refs: branchRefs };
  }).filter(c => c.authorEmail.toLowerCase() === email.toLowerCase());
}

/** Promise.allSettled over items with at most `limit` in flight (gh rate limits). */
async function settleLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** gh calls run concurrently (search ∥ login, then the per-PR reviews calls, GH_CONCURRENCY at a time). */
async function collectReviews(opts, window, errors) {
  const [loginRes, searchRes] = await Promise.allSettled([
    opts.ghLogin ? Promise.resolve(opts.ghLogin) : runAsync('gh', ['api', 'user', '--jq', '.login']).then(s => s.trim()),
    runAsync('gh', ['search', 'prs', `--reviewed-by=${opts.ghLogin || '@me'}`, `--updated=>=${shiftDate(opts.date, -1)}`,
      '--sort', 'updated', '--order', 'asc', '--json', 'number,title,repository,author',
      '--limit', String(PR_SEARCH_LIMIT)]).then(JSON.parse),
  ]);
  if (loginRes.status === 'rejected') {
    const err = loginRes.reason;
    errors.push({ source: 'gh', error: err.code === 'ENOENT' ? 'gh not found' : 'gh api user failed (gh auth login?)' });
    return [];
  }
  if (searchRes.status === 'rejected' || !Array.isArray(searchRes.value)) {
    const why = searchRes.status === 'rejected' ? firstLine(searchRes.reason) : 'unexpected response shape';
    errors.push({ source: 'gh', error: `gh search prs failed: ${why}` });
    return [];
  }
  if (searchRes.value.length >= PR_SEARCH_LIMIT) {
    errors.push({ source: 'gh', error: `gh search hit the ${PR_SEARCH_LIMIT}-PR limit — reviews may be incomplete` });
  }
  const prs = searchRes.value.filter(pr => pr && pr.repository && pr.repository.nameWithOwner);
  const fetched = await settleLimited(prs, GH_CONCURRENCY, pr => runAsync('gh', ['api', '--paginate',
    `repos/${pr.repository.nameWithOwner}/pulls/${pr.number}/reviews`,
    '--jq', '.[] | [.user.login, .state, (.submitted_at // "")] | @tsv']));
  const raw = [];
  fetched.forEach((res, i) => {
    const pr = prs[i];
    const repo = pr.repository.nameWithOwner;
    if (res.status === 'rejected') {
      errors.push({ source: 'gh', repo, pr: pr.number, error: `reviews fetch failed: ${firstLine(res.reason)}` });
      return;
    }
    for (const line of res.value.split('\n').filter(Boolean)) {
      const [user, state, at] = line.split('\t');
      raw.push({ repo, pr: pr.number, title: pr.title, prAuthor: pr.author && pr.author.login, user, state, at });
    }
  });
  return bucketReviews(raw, loginRes.value, window, { projects: opts.projects });
}

async function collect(opts) {
  const errors = [];
  const window = vnDayWindow(opts.date, opts.tz);
  // Kick off gh first: its subprocesses run while the synchronous git scan below blocks.
  const reviewsP = opts.reviews ? collectReviews(opts, window, errors) : Promise.resolve([]);
  const commits = discoverRepos(opts.roots, errors).flatMap(repo => collectCommits(repo, opts, errors));
  const { cards, unmatched } = groupCommits(commits, window, { projects: opts.projects });
  const reviews = await reviewsP;
  return { date: opts.date, tz: opts.tz, cards, reviews, unmatched, errors };
}

if (require.main === module) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`${err.message}\n${USAGE}\n`);
    process.exit(2);
  }
  collect(opts).then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }).catch(err => {
    process.stderr.write(`${err.stack || err}\n`);
    process.exit(1);
  });
}

module.exports = {
  UsageError,
  parseArgs,
  vnDayWindow,
  extractCard,
  stripSubject,
  groupCommits,
  bucketReviews,
  shiftDate,
  toTzIso,
};
