#!/usr/bin/env node
/**
 * Prints the cards of Atlassian MCP `searchJiraIssuesUsingJql` pages grouped by epic.
 * Cards waiting on QA are counted, not listed, unless --all-statuses.
 *
 * Usage: node list-cards.cjs [--all-statuses] <page.json>...
 */
'use strict';

const fs = require('fs');

const PRIORITY_RANK = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 };
// Statuses where the card waits on QA, not on its assignee.
const QA_STATUSES = ['QA Ready', 'Q&A', 'In Test', 'QA Completed'];

function parseArgs(argv) {
  const opts = { allStatuses: false, pages: [] };
  for (const a of argv) {
    if (a === '--all-statuses') opts.allStatuses = true;
    else opts.pages.push(a);
  }
  return opts;
}

// The MCP tool returns {issues: {nodes}}; the REST API returns {issues: [...]}.
function nodesOf(page) {
  const issues = page && page.issues;
  if (Array.isArray(issues)) return issues;
  if (issues && Array.isArray(issues.nodes)) return issues.nodes;
  if (page && Array.isArray(page.nodes)) return page.nodes;
  return [];
}

function isEpic(issue) {
  const type = (issue && issue.fields && issue.fields.issuetype) || {};
  return type.hierarchyLevel === 1 || type.name === 'Epic';
}

function normalize(node) {
  const f = node.fields || {};
  const parent = f.parent && isEpic(f.parent) ? f.parent : null;
  return {
    key: node.key,
    summary: String(f.summary || '').trim(),
    status: (f.status && f.status.name) || '',
    priority: (f.priority && f.priority.name) || 'None',
    epicKey: parent ? parent.key : '',
    epicSummary: parent ? String((parent.fields && parent.fields.summary) || '').trim() : '',
  };
}

function collectCards(pages) {
  const byKey = new Map();
  for (const page of pages) {
    for (const node of nodesOf(page)) {
      if (node && node.key && !isEpic(node)) byKey.set(node.key, normalize(node));
    }
  }
  return [...byKey.values()];
}

function keyNumber(key) {
  return Number(String(key).split('-')[1]) || 0;
}

function buildReport(cards, { allStatuses = false } = {}) {
  const atQA = cards.filter((c) => QA_STATUSES.includes(c.status));
  const listed = allStatuses ? cards : cards.filter((c) => !QA_STATUSES.includes(c.status));
  const lines = [`cards: ${cards.length}`];
  if (!allStatuses) {
    const byStatus = QA_STATUSES.map((st) => [st, atQA.filter((c) => c.status === st).length]).filter(([, n]) => n);
    const detail = byStatus.length ? ` (${byStatus.map(([st, n]) => `${st} ${n}`).join(', ')})` : '';
    lines.push(`listed: ${listed.length}; hidden: ${atQA.length} with QA${detail}`);
  }

  const groups = new Map();
  for (const c of listed) {
    const k = c.epicKey;
    if (!groups.has(k)) groups.set(k, { title: k ? `${k} · ${c.epicSummary}` : '(no epic)', cards: [] });
    groups.get(k).cards.push(c);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === '') - (b === '') || keyNumber(a) - keyNumber(b));
  for (const [, g] of ordered) {
    lines.push('', g.title);
    g.cards
      .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || keyNumber(a.key) - keyNumber(b.key))
      .forEach((c) => lines.push(`  ${c.key}\t${c.status}\t${c.priority}\t${c.summary}`));
  }
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.pages.length) {
    console.error('usage: list-cards.cjs [--all-statuses] <page.json>...');
    process.exit(2);
  }
  const pages = opts.pages.map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
  console.log(buildReport(collectCards(pages), opts));
}

if (require.main === module) main();

module.exports = { parseArgs, nodesOf, normalize, collectCards, buildReport, QA_STATUSES };
