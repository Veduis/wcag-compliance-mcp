/**
 * Smoke test: exercises the check engine, the data lookups, and a live stdio
 * handshake with the server so a regression fails here before it ships.
 *
 *   node test/smoke.mjs
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { auditHtml } from '../src/checks.mjs';
import { deadlinesFor, findPairs, searchCriteria } from '../src/data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const check = (label, fn) => {
  fn();
  passed++;
  console.log(`ok ${passed} - ${label}`);
};

check('flags an image without alt text', () => {
  const { findings } = auditHtml('<img src="chart.png">');
  const hit = findings.find((f) => f.check_id === 'img-alt');
  assert.ok(hit, 'expected img-alt finding');
  assert.equal(hit.sc, '1.1.1');
});

check('accepts a decorative image with empty alt', () => {
  const { findings } = auditHtml('<img src="spacer.png" alt="">');
  assert.equal(findings.find((f) => f.check_id === 'img-alt'), undefined);
});

check('flags an icon-only link', () => {
  const { findings } = auditHtml('<a href="/x"><svg></svg></a>');
  assert.ok(findings.some((f) => f.check_id === 'link-name'));
});

check('flags a form field with no label', () => {
  const { findings } = auditHtml('<input type="email" id="e">');
  assert.ok(findings.some((f) => f.check_id === 'form-label'));
});

check('accepts a wrapped label', () => {
  const { findings } = auditHtml('<label>Email <input type="email"></label>');
  assert.equal(findings.find((f) => f.check_id === 'form-label'), undefined);
});

check('flags a skipped heading level', () => {
  const { findings } = auditHtml('<h1>A</h1><h3>B</h3>');
  assert.ok(findings.some((f) => f.check_id === 'heading-order'));
});

check('flags a zoom-blocking viewport', () => {
  const { findings } = auditHtml('<head><meta name="viewport" content="width=device-width, user-scalable=no"></head>');
  assert.ok(findings.some((f) => f.check_id === 'viewport-zoom'));
});

check('search finds the contrast criterion by number', () => {
  const [first] = searchCriteria('1.4.3');
  assert.equal(first.sc_id, '1.4.3');
});

check('search finds criteria by keyword', () => {
  const results = searchCriteria('focus visible');
  assert.ok(results.length > 0);
});

check('pairs resolve by criterion', () => {
  const pairs = findPairs({ sc_id: '1.1.1' });
  assert.ok(pairs.length >= 3);
  assert.ok(pairs[0].fail_html && pairs[0].pass_html);
});

check('Title II large entity gets the 2027 deadline', () => {
  const result = deadlinesFor('title_ii_large', { asOf: '2026-10-29' });
  const dates = result.all_upcoming.map((d) => d.date);
  assert.ok(dates.some((d) => d.startsWith('2027')));
});

check('Title II small entity gets the 2028 deadline', () => {
  const result = deadlinesFor('title_ii_small', { asOf: '2026-10-29' });
  const dates = result.all_upcoming.map((d) => d.date);
  assert.ok(dates.some((d) => d.startsWith('2028')));
});

check('Title III returns the no-grace-period warning', () => {
  const result = deadlinesFor('title_iii_business', { asOf: '2026-10-29' });
  assert.match(result.note, /no administrative deadline/i);
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve(here, '../src/index.mjs')],
  stderr: 'pipe',
});

const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
check('server exposes four tools', () => {
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ['audit_html_snippet', 'check_ada_compliance_deadlines', 'get_verified_fix_example', 'lookup_wcag_criterion'],
  );
});

const audit = await client.callTool({
  name: 'audit_html_snippet',
  arguments: { html: '<html><body><img src="a.png"><a href="/x"></a></body></html>' },
});
const auditPayload = JSON.parse(audit.content[0].text);
check('tool call returns findings over stdio', () => {
  assert.ok(auditPayload.summary.issues >= 2);
  assert.equal(auditPayload.summary.conformance_claim, false);
});

const lookup = await client.callTool({
  name: 'lookup_wcag_criterion',
  arguments: { query: '2.4.11' },
});
const lookupPayload = JSON.parse(lookup.content[0].text);
check('criterion lookup works over stdio', () => {
  assert.equal(lookupPayload.criteria[0].sc_id, '2.4.11');
});

const fix = await client.callTool({
  name: 'get_verified_fix_example',
  arguments: { sc_id: '1.4.3' },
});
const fixPayload = JSON.parse(fix.content[0].text);
check('fix example works over stdio', () => {
  assert.ok(fixPayload.examples.length > 0);
  assert.equal(fixPayload.examples[0].sc_id, '1.4.3');
});

const deadline = await client.callTool({
  name: 'check_ada_compliance_deadlines',
  arguments: { entity_type: 'title_ii_large', as_of: '2026-10-29' },
});
const deadlinePayload = JSON.parse(deadline.content[0].text);
check('deadline tool works over stdio', () => {
  assert.ok(deadlinePayload.next_deadlines.length > 0);
});

await client.close();
console.log(`\n${passed} checks passed`);
