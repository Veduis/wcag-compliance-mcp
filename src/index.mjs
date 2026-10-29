#!/usr/bin/env node
/**
 * wcag-compliance-mcp
 *
 * MCP server exposing four tools for WCAG 2.2 and U.S. accessibility compliance:
 *   audit_html_snippet            static audit of an HTML fragment or page
 *   lookup_wcag_criterion         search the 87 WCAG 2.2 success criteria
 *   get_verified_fix_example      browser-verified fail/pass pair for a criterion
 *   check_ada_compliance_deadlines  dated obligations for an entity type
 *
 * Data ships with the server, so every call works offline.
 * Dataset: https://doi.org/10.5281/zenodo.23781867
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { auditHtml, AUTOMATED_COVERAGE } from './checks.mjs';
import { deadlinesFor, entityTypes, findPairs, searchCriteria } from './data.mjs';

const server = new McpServer({
  name: 'wcag-compliance-mcp',
  version: '1.0.0',
});

const json = (data) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

server.registerTool(
  'audit_html_snippet',
  {
    title: 'Audit HTML for WCAG 2.2 defects',
    description:
      'Run 18 static WCAG 2.2 checks against an HTML snippet or full page and return findings with the failing success criterion, the offending markup, and a corrected example. Covers alt text, accessible names for links and buttons, form labels, language, title, heading order, duplicate ids, tabindex, aria-hidden, list structure, iframe titles, table headers, video captions, viewport zoom, and autocomplete purpose. Static analysis only: it cannot judge contrast, keyboard traps, focus visibility, or reading order in a rendered page.',
    inputSchema: {
      html: z.string().min(1).describe('HTML fragment or full document to audit'),
      severity_floor: z.enum(['error', 'all']).optional().describe('Return only errors (default) or every finding'),
    },
  },
  async ({ html, severity_floor }) => {
    const result = auditHtml(html);
    const findings = severity_floor === 'all' ? result.findings : result.findings.filter((f) => f.severity === 'error');
    return json({
      summary: {
        issues: result.error_count,
        checks_run: result.checks_run,
        checks_failed: findings.length,
        automated_coverage: AUTOMATED_COVERAGE,
        conformance_claim: false,
      },
      findings,
    });
  },
);

server.registerTool(
  'lookup_wcag_criterion',
  {
    title: 'Look up a WCAG 2.2 success criterion',
    description:
      'Search the 87 WCAG 2.2 success criteria by number (1.4.3), name (Contrast), keyword, or axe-core rule name. Returns level, principle, guideline, whether it applies to U.S. ADA Title II entities, the practical test, the axe-core rules that target it, and links to the W3C specification and Understanding document.',
    inputSchema: {
      query: z.string().min(1).describe('Criterion number, name, or keyword such as "focus visible" or "contrast"'),
      level: z.enum(['A', 'AA', 'AAA']).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
  },
  async ({ query, level, limit }) => {
    const results = searchCriteria(query, { level, limit: limit || 5 });
    return json({
      count: results.length,
      criteria: results.map((c) => ({
        sc_id: c.sc_id,
        name: c.name,
        level: c.level,
        principle: c.principle,
        guideline: `${c.guideline_id} ${c.guideline}`,
        added_in: c.introduced_in,
        ada_title_ii_scope: c.doj_title_ii_scope,
        summary: c.summary,
        how_to_test: c.how_to_test,
        axe_core_rules: c.axe_core_rules,
        has_automated_rule: c.has_axe_core_rule,
        verified_test_cases: c.verified_test_cases,
        spec_url: c.spec_url,
        understanding_url: c.understanding_url,
      })),
    });
  },
);

server.registerTool(
  'get_verified_fix_example',
  {
    title: 'Get a browser-verified WCAG fix example',
    description:
      'Return a failing HTML snippet and its corrected version for a WCAG 2.2 defect, with an explanation of the impact on assistive technology and a manual test step. Every pair was executed in headless Chromium against axe-core 4.14.0, and the detection method is reported so you know whether automation catches this defect or a human must. Look up by criterion number (2.4.7), pair id (wcag-1-4-3-01), or keyword (focus indicator).',
    inputSchema: {
      sc_id: z.string().optional().describe('Success criterion number, for example 1.4.3'),
      query: z.string().optional().describe('Keyword when the criterion number is unknown'),
      limit: z.number().int().min(1).max(10).optional(),
    },
  },
  async ({ sc_id, query, limit }) => {
    const found = findPairs({ sc_id, query, limit: limit || 3 });
    return json({
      count: found.length,
      examples: found.map((p) => ({
        pair_id: p.pair_id,
        sc_id: p.sc_id,
        sc_name: p.sc_name,
        level: p.level,
        defect: p.title,
        detection: p.detection,
        automated: p.detection === 'axe' || p.detection === 'axe-review',
        axe_rule: p.axe_rule || null,
        failing_html: p.fail_html,
        corrected_html: p.pass_html,
        why_it_matters: p.explanation,
        manual_test: p.how_to_test_manually,
      })),
      source: 'https://doi.org/10.5281/zenodo.23781867',
    });
  },
);

server.registerTool(
  'check_ada_compliance_deadlines',
  {
    title: 'Check ADA / Section 504 web accessibility deadlines',
    description:
      'Return the dated web accessibility obligations that apply to an entity type, from the 1990 ADA statute through the 2027 and 2028 deadlines in the DOJ Title II final rule and the HHS Section 504 rule. Reports what is binding now, what is upcoming within the horizon with days remaining, and the primary source URL for every date. Entity types: title_ii_large, title_ii_small, title_iii_business, federal_contractor, hhs_recipient, eu_business, ontario.',
    inputSchema: {
      entity_type: z.enum(entityTypes).describe('Entity type to scope the timeline to'),
      as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Reference date in YYYY-MM-DD, defaults to today'),
      horizon_years: z.number().int().min(1).max(10).optional(),
    },
  },
  async ({ entity_type, as_of, horizon_years }) => {
    const result = deadlinesFor(entity_type, {
      asOf: as_of || new Date().toISOString().slice(0, 10),
      horizonYears: horizon_years || 4,
    });
    return json({
      ...result,
      entity_types_available: entityTypes,
      source: 'https://doi.org/10.5281/zenodo.23781873',
    });
  },
);

server.registerResource(
  'wcag-automation-coverage',
  'wcag://coverage',
  {
    title: 'Automated WCAG 2.2 coverage limits',
    description: 'How much of WCAG 2.2 a scanner can actually test, measured against 64 browser-verified cases.',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            ...AUTOMATED_COVERAGE,
            measured: {
              axe_core_version: '4.14.0',
              defective_documents_flagged: '39 of 64',
              corrected_documents_clean: '63 of 64',
              criteria_without_any_axe_rule: '66 of 87',
            },
            datasets: {
              fail_pass_pairs: 'https://doi.org/10.5281/zenodo.23781867',
              success_criteria: 'https://doi.org/10.5281/zenodo.23781861',
              regulatory_timeline: 'https://doi.org/10.5281/zenodo.23781873',
              remediation_prompts: 'https://doi.org/10.5281/zenodo.23781879',
            },
            full_domain_scanner: 'https://veduis.com/products/vcompliance-scanner/',
          },
          null,
          2,
        ),
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('wcag-compliance-mcp running on stdio');
