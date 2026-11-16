#!/usr/bin/env node
/**
 * Test suite for list-cards.cjs
 * Run: node plugins/rock288/skills/ef-cards/scripts/list-cards.test.cjs
 */
'use strict';

const assert = require('assert');
const { nodesOf, normalize, collectCards, buildReport, parseArgs } = require('./list-cards.cjs');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

const epic = { key: 'CHAL-1019', fields: { summary: '[API] Enhance UX', issuetype: { name: 'Epic', hierarchyLevel: 1 } } };
const story = { key: 'CHAL-5', fields: { summary: 'Parent story', issuetype: { name: 'Story', hierarchyLevel: 0 } } };
function issue(key, extra = {}) {
  return {
    key,
    fields: Object.assign({
      summary: ` card ${key} `,
      issuetype: { name: 'Task', hierarchyLevel: 0 },
      status: { name: 'To Do' },
      priority: { name: 'High' },
    }, extra),
  };
}
const qaReady = { status: { name: 'QA Ready' } };

test('nodesOf reads the MCP shape', () => {
  assert.strictEqual(nodesOf({ issues: { nodes: [1, 2] } }).length, 2);
});
test('nodesOf reads the REST shape', () => {
  assert.strictEqual(nodesOf({ issues: [1] }).length, 1);
});
test('nodesOf tolerates junk', () => {
  assert.deepStrictEqual(nodesOf({}), []);
  assert.deepStrictEqual(nodesOf(null), []);
});
test('normalize keeps an epic parent', () => {
  const c = normalize(issue('CHAL-1', { parent: epic }));
  assert.strictEqual(c.epicKey, 'CHAL-1019');
  assert.strictEqual(c.epicSummary, '[API] Enhance UX');
  assert.strictEqual(c.summary, 'card CHAL-1');
});
test('normalize drops a non-epic parent', () => {
  assert.strictEqual(normalize(issue('CHAL-2', { parent: story })).epicKey, '');
});
test('normalize defaults a missing priority to None', () => {
  assert.strictEqual(normalize(issue('CHAL-3', { priority: null })).priority, 'None');
});
test('collectCards dedupes across pages and skips epics', () => {
  const cards = collectCards([{ issues: { nodes: [issue('CHAL-1'), epic] } }, { issues: { nodes: [issue('CHAL-1'), issue('CHAL-2')] } }]);
  assert.deepStrictEqual(cards.map((c) => c.key), ['CHAL-1', 'CHAL-2']);
});
test('buildReport groups by epic, epics before no-epic', () => {
  const out = buildReport(collectCards([{ issues: { nodes: [issue('CHAL-9'), issue('CHAL-8', { parent: epic })] } }]));
  assert.ok(out.indexOf('CHAL-1019 · [API] Enhance UX') < out.indexOf('(no epic)'));
});
test('buildReport sorts by priority then key', () => {
  const out = buildReport(collectCards([{ issues: { nodes: [
    issue('CHAL-20', { parent: epic, priority: { name: 'Low' } }),
    issue('CHAL-30', { parent: epic, priority: { name: 'Highest' } }),
    issue('CHAL-10', { parent: epic, priority: { name: 'Low' } }),
  ] } }]));
  const at = (key) => out.indexOf(`  ${key}\t`);
  assert.ok(at('CHAL-30') < at('CHAL-10'));
  assert.ok(at('CHAL-10') < at('CHAL-20'));
});
test('buildReport hides QA statuses unless asked', () => {
  const cards = collectCards([{ issues: { nodes: [issue('CHAL-1'), issue('CHAL-2', qaReady)] } }]);
  const out = buildReport(cards);
  assert.match(out, /listed: 1; hidden: 1 with QA \(QA Ready 1\)/);
  assert.ok(!out.includes('CHAL-2\t'));
  assert.ok(buildReport(cards, { allStatuses: true }).includes('CHAL-2\t'));
});
test('parseArgs splits flags and pages', () => {
  const o = parseArgs(['a.json', '--all-statuses', 'b.json']);
  assert.deepStrictEqual(o.pages, ['a.json', 'b.json']);
  assert.strictEqual(o.allStatuses, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
