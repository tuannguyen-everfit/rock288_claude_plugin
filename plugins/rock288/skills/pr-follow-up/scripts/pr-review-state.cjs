#!/usr/bin/env node
/**
 * Where a PR stands after the review request: new feedback to triage, open review threads, and whether the merge
 * gate passes. One GraphQL read through gh; the summary is a pure function so the rules are tested without GitHub.
 *
 *   node pr-review-state.cjs <owner/repo#number | PR url> [--since <iso>]
 *
 * --since: only feedback created after this time counts as new (the previous follow-up run). Feedback written by the
 * PR author or the gh user running this is never "new": it is our own reply.
 *
 * Only required checks hold the merge: some repos run checks on every PR that always fail (e.g. a stg CodeBuild
 * trigger) and merge anyway, so a red non-required check is listed but does not block.
 *
 * Open threads do not hold the merge: once a reviewer approves the current head, the PR merges. They are still
 * listed, with whether each waits on our reply, so the follow-up answers them after the merge.
 * Ported from core-foundry tools/post-merge/pr-review-state.mjs.
 */

const { execFileSync } = require('child_process');

const QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){
  number url state isDraft mergedAt mergeCommit{oid} headRefOid baseRefName reviewDecision mergeStateStatus author{login}
  reviews(last:100){nodes{author{login} state submittedAt body url commit{oid}}}
  comments(last:100){nodes{author{login} body createdAt url}}
  reviewThreads(first:100){nodes{isResolved isOutdated path line comments(first:50){nodes{author{login} body createdAt url}}}}
  commits(last:1){nodes{commit{statusCheckRollup{state contexts(first:100){nodes{__typename ... on CheckRun{name conclusion status isRequired(pullRequestNumber:$number)} ... on StatusContext{context state isRequired(pullRequestNumber:$number)}}}}}}}
}}}`;

/** "Everfit-io/challenger-service#123" or "https://github.com/Everfit-io/challenger-service/pull/123". */
function parsePrRef(ref) {
  const m = ref.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/) || ref.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`not a PR reference: ${ref}`);
  return { owner: m[1], name: m[2], number: Number(m[3]) };
}

function summarizePullRequest(pr, { since = null, self = null } = {}) {
  const mine = new Set([pr.author && pr.author.login, self].filter(Boolean));
  const login = (x) => x.author && x.author.login;
  const isNew = (at, who) => !mine.has(who) && (!since || Date.parse(at) > Date.parse(since));

  // The latest review per reviewer is their current verdict; a COMMENTED review does not cancel an earlier verdict.
  const verdicts = new Map();
  for (const r of pr.reviews.nodes) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)) verdicts.set(login(r), r);
  }
  const current = [...verdicts.values()];
  const changesRequested = current.filter((r) => r.state === 'CHANGES_REQUESTED');
  const approvals = current.filter((r) => r.state === 'APPROVED');

  const openThreads = pr.reviewThreads.nodes
    .filter((t) => !t.isResolved && !t.isOutdated)
    .map((t) => {
      const comments = t.comments.nodes;
      const first = comments[0];
      const last = comments[comments.length - 1];
      return {
        path: t.path,
        line: t.line,
        url: first && first.url,
        first: first && first.body,
        last_author: last && login(last),
        last_at: last ? last.createdAt : null,
        awaiting_our_reply: !mine.has(last && login(last)),
      };
    });

  const feedback = [
    ...pr.reviews.nodes
      .filter((r) => ((r.body && r.body.trim()) || r.state === 'CHANGES_REQUESTED') && isNew(r.submittedAt, login(r)))
      .map((r) => ({ kind: 'review', state: r.state, author: login(r), at: r.submittedAt, body: r.body, url: r.url })),
    ...pr.comments.nodes
      .filter((c) => isNew(c.createdAt, login(c)))
      .map((c) => ({ kind: 'comment', author: login(c), at: c.createdAt, body: c.body, url: c.url })),
    ...pr.reviewThreads.nodes.flatMap((t) =>
      t.comments.nodes
        .filter((c) => isNew(c.createdAt, login(c)))
        .map((c) => ({ kind: 'thread', path: t.path, line: t.line, resolved: t.isResolved, author: login(c), at: c.createdAt, body: c.body, url: c.url })),
    ),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const lastCommit = pr.commits.nodes[0];
  const rollup = lastCommit && lastCommit.commit.statusCheckRollup;
  const checks = rollup ? rollup.contexts.nodes : [];
  const required = checks.filter((c) => c.isRequired);
  const gate = {
    not_draft: { ok: !pr.isDraft },
    approved: { ok: pr.reviewDecision ? pr.reviewDecision === 'APPROVED' : approvals.length > 0, detail: pr.reviewDecision || `${approvals.length} approval(s)` },
    no_changes_requested: { ok: changesRequested.length === 0, detail: changesRequested.map(login).join(', ') || 'none' },
    approval_on_head: { ok: approvals.some((r) => r.commit && r.commit.oid === pr.headRefOid), detail: 'an approval must cover the current head; a push after approval needs re-review' },
    ci_green: {
      ok: required.every(checkPassed),
      detail: checks.length
        ? checks.map((c) => `${c.name || c.context}=${c.conclusion || c.status || c.state}${c.isRequired ? ' (required)' : ''}`).join(', ')
        : 'no checks configured',
    },
    up_to_date: { ok: pr.mergeStateStatus !== 'BEHIND', detail: pr.mergeStateStatus },
  };

  const phase =
    pr.state === 'MERGED' ? 'merged'
    : pr.state === 'CLOSED' ? 'closed'
    : changesRequested.length > 0 ? 'changes_requested'
    : gate.approved.ok ? 'approved'
    : 'in_review';

  return {
    pr: pr.url,
    phase,
    head: pr.headRefOid,
    base: pr.baseRefName,
    merged_at: pr.mergedAt,
    merge_commit: pr.mergeCommit ? pr.mergeCommit.oid : null,
    new_feedback: feedback,
    open_threads: openThreads,
    gate,
    merge_ready: pr.state === 'OPEN' && Object.values(gate).every((g) => g.ok),
  };
}

/** A finished, passing check: CheckRun conclusion or StatusContext state. Skipped / neutral runs do not block. */
function checkPassed(c) {
  return ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.conclusion || c.state);
}

function fetchPullRequest({ owner, name, number }) {
  const out = execFileSync('gh', ['api', 'graphql', '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${number}`, '-f', `query=${QUERY}`], { encoding: 'utf8' });
  return JSON.parse(out).data.repository.pullRequest;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const ref = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--since');
  if (!ref) {
    console.error('usage: pr-review-state.cjs <owner/repo#number | PR url> [--since <iso>]');
    process.exit(64);
  }
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;
  const self = execFileSync('gh', ['api', 'user', '-q', '.login'], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify(summarizePullRequest(fetchPullRequest(parsePrRef(ref)), { since, self }), null, 2));
}

module.exports = { parsePrRef, summarizePullRequest };
