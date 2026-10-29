/**
 * Builds the MCPB bundle (manifest.json + bundled server + data).
 *
 * Output is byte-stable so the SHA-256 in server.json stays valid between a
 * local build and a CI build. Timestamps are pinned and entries are sorted.
 *
 *   node scripts/build-mcpb.mjs [--out dist/wcag-compliance-mcp.mcpb]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outArg = process.argv.indexOf('--out');
const out = path.resolve(root, outArg > -1 ? process.argv[outArg + 1] : 'dist/wcag-compliance-mcp.mcpb');
const stage = path.resolve(root, 'dist/.mcpb-stage');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'server'), { recursive: true });
fs.mkdirSync(path.dirname(out), { recursive: true });

// 1. Bundle the server and its dependencies into one file.
execFileSync(
  path.join(root, 'node_modules/.bin/esbuild'),
  [
    path.join(root, 'src/index.mjs'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node18',
    '--legal-comments=none',
    `--outfile=${path.join(stage, 'server/index.mjs')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

// 2. Ship the data next to the bundle. The loader resolves ../data relative to src/.
fs.cpSync(path.join(root, 'data'), path.join(stage, 'data'), { recursive: true });

// 3. Manifest.
const manifest = {
  manifest_version: '0.3',
  name: 'wcag-compliance-mcp',
  display_name: 'WCAG 2.2 Compliance',
  version: pkg.version,
  description:
    'Audit HTML against 18 WCAG 2.2 checks with corrected markup, look up criteria with ADA Title II scope, get fix examples verified against axe-core 4.14.0, and check U.S. accessibility deadlines.',
  long_description:
    'Four tools for accessibility work: audit_html_snippet runs 18 static WCAG 2.2 checks and returns the failing criterion with corrected markup, lookup_wcag_criterion searches all 87 criteria, get_verified_fix_example returns fail/pass pairs tested in headless Chromium, and check_ada_compliance_deadlines answers when an organization has to comply. Data is bundled, so it works offline with no API keys.',
  author: {
    name: 'Veduis LLC',
    url: 'https://veduis.com/',
  },
  homepage: 'https://veduis.com/products/vcompliance-scanner/',
  repository: {
    type: 'git',
    url: 'https://github.com/Veduis/wcag-compliance-mcp',
  },
  license: 'MIT',
  keywords: ['wcag', 'accessibility', 'a11y', 'ada', 'compliance', 'axe-core'],
  server: {
    type: 'node',
    entry_point: 'server/index.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/index.mjs'],
    },
  },
  tools: [
    { name: 'audit_html_snippet', description: 'Run 18 static WCAG 2.2 checks on HTML and return findings with corrected markup.' },
    { name: 'lookup_wcag_criterion', description: 'Search the 87 WCAG 2.2 success criteria with level, guideline, and ADA Title II scope.' },
    { name: 'get_verified_fix_example', description: 'Return a failing snippet, the corrected snippet, and the manual test for a criterion.' },
    { name: 'check_ada_compliance_deadlines', description: 'Return the dated compliance obligations for an entity type.' },
  ],
  compatibility: {
    platforms: ['darwin', 'linux', 'win32'],
    runtimes: { node: '>=18' },
  },
};

fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(stage, 'README.md'), fs.readFileSync(path.join(root, 'README.md')));
fs.writeFileSync(path.join(stage, 'LICENSE'), fs.readFileSync(path.join(root, 'LICENSE')));

// 4. Pin timestamps so the archive hash is reproducible.
const pinned = new Date('2026-01-01T00:00:00Z');
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else fs.utimesSync(full, pinned, pinned);
  }
};
walk(stage);
fs.utimesSync(stage, pinned, pinned);

// 5. Zip with sorted entries, no extra attributes.
fs.rmSync(out, { force: true });
execFileSync('zip', ['-X', '-q', '-r', out, '.', '-x', '.DS_Store'], {
  cwd: stage,
  stdio: 'inherit',
});

const bytes = fs.readFileSync(out);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
console.log(`built ${path.relative(root, out)} (${(bytes.length / 1024).toFixed(0)} KB)`);
console.log(`sha256 ${sha}`);

// Keep server.json in step with the artifact.
const serverJsonPath = path.join(root, 'server.json');
const serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf8'));
serverJson.packages = [
  {
    registryType: 'mcpb',
    identifier: `https://github.com/Veduis/wcag-compliance-mcp/releases/download/v${pkg.version}/wcag-compliance-mcp.mcpb`,
    fileSha256: sha,
    transport: { type: 'stdio' },
  },
];
fs.writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2) + '\n');
console.log('server.json updated');
