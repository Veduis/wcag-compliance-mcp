# wcag-compliance-mcp

MCP server for WCAG 2.2 audits, verified remediation examples, and U.S. accessibility deadlines. Four tools, no API keys, no network calls, all data bundled.

Built from a benchmark that was verified in headless Chromium: 64 fail/pass HTML pairs executed against axe-core 4.14.0, all 87 WCAG 2.2 success criteria, and 21 sourced regulatory dates from the 1990 ADA through the 2028 DOJ Title II deadline.

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23781867.svg)](https://doi.org/10.5281/zenodo.23781867)

## Tools

| Tool | What it answers |
| --- | --- |
| `audit_html_snippet` | Which WCAG 2.2 defects are in this HTML, what is the failing criterion, and what does the fix look like |
| `lookup_wcag_criterion` | What does 1.4.3 mean, what level is it, does it apply to ADA Title II entities, and is there an automated rule |
| `get_verified_fix_example` | Show me a failing snippet, the corrected snippet, why it matters, and how to test it manually |
| `check_ada_compliance_deadlines` | When does my organization have to comply, and what rule sets the date |

### `audit_html_snippet`

18 static checks over a fragment or full document:

| Check | Success criterion |
| --- | --- |
| Image without a text alternative | 1.1.1 |
| Image button without alt | 1.1.1 |
| `role="img"` SVG with no name | 1.1.1 |
| Link with no accessible name | 2.4.4 |
| Button with no accessible name | 4.1.2 |
| Form field with no programmatic label | 3.3.2 |
| Missing `html lang` | 3.1.1 |
| Missing page title | 2.4.2 |
| Skipped heading levels or no h1 | 1.3.1 |
| Duplicate `id` values | 4.1.1 |
| Positive `tabindex` | 2.4.3 |
| `aria-hidden` on a focusable element | 4.1.2 |
| Non-`li` children of `ul`/`ol` | 1.3.1 |
| `iframe` without `title` | 4.1.2 |
| Data table without `th` | 1.3.1 |
| `video` without a captions track | 1.2.2 |
| Viewport meta blocking zoom | 1.4.4 |
| Common-purpose input without `autocomplete` | 1.3.5 |

Every finding returns the criterion, the offending markup, and a corrected snippet.

### `check_ada_compliance_deadlines`

Entity types: `title_ii_large`, `title_ii_small`, `title_iii_business`, `federal_contractor`, `hhs_recipient`, `eu_business`, `ontario`.

Pass `as_of` to compute the answer for any date, which makes the tool useful for retroactive scoping and for legal memos that need to state what applied on a given day. Every date carries its primary source URL.

## Install

```bash
npx -y github:Veduis/wcag-compliance-mcp
```

The npm package `wcag-compliance-mcp` lands with the next publish. Until then the GitHub spec above installs the same code and dependencies.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "wcag-compliance": {
      "command": "npx",
      "args": ["-y", "github:Veduis/wcag-compliance-mcp"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "wcag-compliance": {
      "command": "npx",
      "args": ["-y", "github:Veduis/wcag-compliance-mcp"]
    }
  }
}
```

### VS Code (Copilot agent mode)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "wcag-compliance": {
      "command": "npx",
      "args": ["-y", "github:Veduis/wcag-compliance-mcp"]
    }
  }
}
```

### Docker

```bash
docker build -t wcag-compliance-mcp .
docker run -i --rm wcag-compliance-mcp
```

## Example

Ask your agent:

> Audit this pricing page for WCAG 2.2 issues and give me the corrected markup.

The agent calls `audit_html_snippet`, then `get_verified_fix_example` for each failing criterion. What comes back is a failing snippet, the corrected snippet, and the manual test step, not a vague warning.

```
$ audit_html_snippet('<img src="chart.png">')

{
  "summary": {
    "issues": 1,
    "checks_run": 18,
    "checks_failed": 1,
    "conformance_claim": false
  },
  "findings": [
    {
      "check_id": "img-alt",
      "sc": "1.1.1",
      "level": "A",
      "title": "Image missing a text alternative",
      "count": 1,
      "elements": [
        {
          "snippet": "<img src=\"chart.png\">",
          "reason": "No alt, aria-label, or aria-labelledby. Decorative images need alt=\"\"."
        }
      ],
      "fix": "<img src=\"chart.png\" alt=\"Bar chart: Q3 revenue rose 18 percent over Q2\">"
    }
  ]
}
```

## What automation cannot see

This matters more than the feature list. In the benchmark behind this server, axe-core 4.14.0 flagged 39 of 64 deliberately defective documents. The other 25 needed scripted checks or a human. Across the full standard, 66 of 87 criteria have no automated rule at all.

So the server reports `conformance_claim: false` on every audit. A clean result means no static defect was found, not that the page conforms. Contrast, focus visibility, keyboard traps, reading order, captions accuracy, and error recovery all need a rendered page or a person. If you need a full-domain audit with those checks, that is what [vComplianceScanner](https://veduis.com/products/vcompliance-scanner/) does.

## Data provenance

| Dataset | DOI |
| --- | --- |
| 64 browser-verified fail/pass pairs, axe-core 4.14.0 | [10.5281/zenodo.23781867](https://doi.org/10.5281/zenodo.23781867) |
| 87 WCAG 2.2 success criteria with rule mapping | [10.5281/zenodo.23781861](https://doi.org/10.5281/zenodo.23781861) |
| 21 sourced ADA / Section 504 / EAA dates | [10.5281/zenodo.23781873](https://doi.org/10.5281/zenodo.23781873) |
| 64 multi-turn LLM remediation prompts | [10.5281/zenodo.23781879](https://doi.org/10.5281/zenodo.23781879) |

Mirrors: [Hugging Face](https://huggingface.co/VeduisWeb). Test cases are CC BY 4.0, code is MIT.

## Development

```bash
npm install
npm test          # 18 checks, including a live stdio handshake
npm start
```

Layout:

```
src/index.mjs    MCP server, tool registration, resource
src/checks.mjs   18 static checks, no browser required
src/data.mjs     criteria, pairs, timeline, deadline resolution
data/            bundled JSON, generated from the published datasets
test/smoke.mjs   engine tests plus protocol handshake
```

## More from Veduis

- [WCAG 2.2 developer implementation manual](https://veduis.com/blog/web-accessibility-wcag-complete-guide/)
- [ADA Title II vs Title III: which law applies to a website](https://veduis.com/blog/ada-title-iii-vs-title-ii-websites/)
- [ADA demand letter defense](https://veduis.com/compliance-solutions/ada-demand-letter/)

## License

MIT for the code. Dataset content is CC BY 4.0, attribution to Veduis LLC.
