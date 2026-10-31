/**
 * Static WCAG 2.2 checks that do not need a browser.
 *
 * These are the checks a scanner can make from markup alone. Everything that
 * needs layout, computed styles, focus order in a live document, or human
 * judgment is out of scope here and is reported as such by the audit tool.
 *
 * Every check returns findings shaped as:
 *   { check_id, sc, level, title, severity, count, elements[], fix }
 */

import { parse } from 'node-html-parser';

const MAX_ELEMENTS = 5;

function snippet(el) {
  const raw = (el.outerHTML || '').replace(/\s+/g, ' ').trim();
  return raw.length > 220 ? raw.slice(0, 217) + '...' : raw;
}

function attr(el, name) {
  const value = el.getAttribute(name);
  return value === undefined || value === null ? null : value;
}

function textOf(el) {
  return (el.text || '').replace(/\s+/g, ' ').trim();
}

function accessibleName(el, root) {
  const labelledBy = attr(el, 'aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => root.querySelector(`#${id.replace(/[^\w-]/g, '')}`))
      .filter(Boolean)
      .map(textOf);
    const joined = parts.join(' ').trim();
    if (joined) return joined;
  }
  const ariaLabel = attr(el, 'aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  const alt = attr(el, 'alt');
  if (alt && alt.trim()) return alt.trim();
  const title = attr(el, 'title');
  if (title && title.trim()) return title.trim();
  const visible = textOf(el);
  if (visible) return visible;
  for (const img of el.querySelectorAll('img')) {
    const imgAlt = attr(img, 'alt');
    if (imgAlt && imgAlt.trim()) return imgAlt.trim();
  }
  for (const svg of el.querySelectorAll('svg')) {
    const label = attr(svg, 'aria-label');
    const t = svg.querySelector('title');
    if (label && label.trim()) return label.trim();
    if (t && textOf(t)) return textOf(t);
  }
  return '';
}

function imgName(img, root) {
  const labelledBy = attr(img, 'aria-labelledby');
  if (labelledBy) {
    const joined = labelledBy
      .split(/\s+/)
      .map((id) => root.querySelector(`#${id.replace(/[^\w-]/g, '')}`))
      .filter(Boolean)
      .map(textOf)
      .join(' ')
      .trim();
    if (joined) return joined;
  }
  return (attr(img, 'aria-label') || attr(img, 'alt') || '').trim();
}

function isHidden(el) {
  if (attr(el, 'aria-hidden') === 'true') return true;
  if (attr(el, 'hidden') !== null) return true;
  const style = (attr(el, 'style') || '').replace(/\s+/g, '').toLowerCase();
  return style.includes('display:none') || style.includes('visibility:hidden');
}

export function auditHtml(html) {
  const root = parse(html, { comment: false });
  const findings = [];

  const add = (check) => {
    if (check.count > 0) findings.push({ severity: 'error', ...check });
  };

  // 1.1.1 Non-text Content: img without an accessible name
  {
    const bad = root
      .querySelectorAll('img')
      .filter((el) => !isHidden(el) && attr(el, 'alt') === null && !imgName(el, root));
    add({
      check_id: 'img-alt',
      sc: '1.1.1',
      level: 'A',
      title: 'Image missing a text alternative',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'No alt, aria-label, or aria-labelledby. Decorative images need alt="".' })),
      fix: '<img src="chart.png" alt="Bar chart: Q3 revenue rose 18 percent over Q2">',
    });
  }

  // 1.1.1 Image buttons
  {
    const bad = root.querySelectorAll('input').filter((el) => (attr(el, 'type') || '').toLowerCase() === 'image' && !(attr(el, 'alt') || attr(el, 'aria-label')));
    add({
      check_id: 'image-input-alt',
      sc: '1.1.1',
      level: 'A',
      title: 'Image button missing alternative text',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'alt on input type=image is the button name.' })),
      fix: '<input type="image" src="search.png" alt="Search">',
    });
  }

  // 1.1.1 Exposed inline SVG without a name
  {
    const bad = root.querySelectorAll('svg').filter((el) => attr(el, 'role') === 'img' && !imgName(el, root));
    add({
      check_id: 'svg-name',
      sc: '1.1.1',
      level: 'A',
      title: 'SVG with role="img" has no accessible name',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'role="img" needs aria-label, aria-labelledby, or a title child.' })),
      fix: '<svg role="img" aria-label="Status: online">...</svg>',
    });
  }

  // 2.4.4 Link Purpose: link with no name
  {
    const bad = root
      .querySelectorAll('a')
      .filter((el) => attr(el, 'href') !== null && !isHidden(el) && !accessibleName(el, root));
    add({
      check_id: 'link-name',
      sc: '2.4.4',
      level: 'A',
      title: 'Link has no accessible name',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'Empty or icon-only links need visible text, an image alt, or aria-label.' })),
      fix: '<a href="/pricing"><svg aria-hidden="true">...</svg><span class="sr-only">Pricing</span></a>',
    });
  }

  // 4.1.2 Name, Role, Value: button with no name
  {
    const bad = root.querySelectorAll('button').filter((el) => !isHidden(el) && !accessibleName(el, root));
    add({
      check_id: 'button-name',
      sc: '4.1.2',
      level: 'A',
      title: 'Button has no accessible name',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'Icon-only buttons need aria-label or visually hidden text.' })),
      fix: '<button aria-label="Close dialog">x</button>',
    });
  }

  // 3.3.2 Labels or Instructions: form fields without a label
  {
    const fields = root.querySelectorAll('input, select, textarea');
    const bad = fields.filter((el) => {
      const type = (attr(el, 'type') || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return false;
      if (attr(el, 'aria-label') || attr(el, 'aria-labelledby')) return false;
      const id = attr(el, 'id');
      if (id && root.querySelector(`label[for="${id.replace(/"/g, '')}"]`)) return false;
      let parent = el.parentNode;
      while (parent) {
        if (parent.rawTagName && parent.rawTagName.toLowerCase() === 'label') return false;
        parent = parent.parentNode;
      }
      return attr(el, 'title') === null;
    });
    add({
      check_id: 'form-label',
      sc: '3.3.2',
      level: 'A',
      title: 'Form field has no programmatic label',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'Add label[for], a wrapping label, aria-label, or aria-labelledby.' })),
      fix: '<label for="email">Email</label><input id="email" type="email">',
    });
  }

  // 3.1.1 Language of Page
  {
    const html = root.querySelector('html');
    const lang = html ? attr(html, 'lang') : null;
    const body = root.querySelector('body');
    const onlyFragment = !html && !body;
    add({
      check_id: 'html-lang',
      sc: '3.1.1',
      level: 'A',
      title: 'Document language is not declared',
      count: !onlyFragment && !lang ? 1 : 0,
      elements: !onlyFragment && !lang ? [{ snippet: '<html>', reason: 'Set lang on the html element, for example lang="en".' }] : [],
      fix: '<html lang="en">',
    });
  }

  // 2.4.2 Page Titled
  {
    const head = root.querySelector('head');
    const title = head ? head.querySelector('title') : null;
    const count = head && (!title || !textOf(title)) ? 1 : 0;
    add({
      check_id: 'page-title',
      sc: '2.4.2',
      level: 'A',
      title: 'Page has no title',
      count,
      elements: count ? [{ snippet: '<head>', reason: 'Title should describe the page purpose and differ from other pages.' }] : [],
      fix: '<title>Pricing | Acme</title>',
    });
  }

  // 1.3.1 Info and Relationships: skipped heading levels
  {
    const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const levels = headings.map((h) => Number(h.rawTagName.slice(1)));
    const jumps = [];
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        jumps.push({ snippet: snippet(headings[i]), reason: `Heading level jumped from h${levels[i - 1]} to h${levels[i]}.` });
      }
    }
    const noH1 = headings.length > 0 && !levels.includes(1);
    add({
      check_id: 'heading-order',
      sc: '1.3.1',
      level: 'A',
      title: 'Heading structure skips levels',
      count: jumps.length + (noH1 ? 1 : 0),
      elements: [
        ...(noH1 ? [{ snippet: '<h2>...</h2>', reason: 'No h1 found on a page that uses headings.' }] : []),
        ...jumps.slice(0, MAX_ELEMENTS),
      ],
      fix: '<h1>Page title</h1><h2>Section</h2><h3>Subsection</h3>',
    });
  }

  // 4.1.1 Parsing: duplicate ids
  {
    const seen = new Map();
    for (const el of root.querySelectorAll('[id]')) {
      const id = attr(el, 'id');
      if (!id) continue;
      seen.set(id, (seen.get(id) || 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    add({
      check_id: 'duplicate-id',
      sc: '4.1.1',
      level: 'A',
      title: 'Duplicate id attribute values',
      count: dupes.length,
      elements: dupes.slice(0, MAX_ELEMENTS).map(([id, n]) => ({ snippet: `id="${id}"`, reason: `Appears ${n} times. Labels, aria-labelledby and anchors resolve to the first match only.` })),
      fix: '<input id="email-signup"> <input id="email-login">',
    });
  }

  // 2.4.3 Focus Order: positive tabindex
  {
    const bad = root.querySelectorAll('[tabindex]').filter((el) => Number(attr(el, 'tabindex')) > 0);
    add({
      check_id: 'positive-tabindex',
      sc: '2.4.3',
      level: 'A',
      title: 'Positive tabindex overrides natural focus order',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'Positive tabindex values break reading order for keyboard users.' })),
      fix: 'Use tabindex="0" or leave the element in DOM order.',
    });
  }

  // 4.1.2 aria-hidden on a focusable element
  {
    const bad = root.querySelectorAll('[aria-hidden="true"]').filter((el) => {
      const tag = (el.rawTagName || '').toLowerCase();
      if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) return true;
      return Number(attr(el, 'tabindex')) >= 0 && attr(el, 'tabindex') !== null;
    });
    add({
      check_id: 'aria-hidden-focusable',
      sc: '4.1.2',
      level: 'A',
      title: 'Focusable element is hidden from assistive technology',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'aria-hidden="true" on a focusable element creates a keyboard trap with no announced name.' })),
      fix: 'Remove aria-hidden or add tabindex="-1" and inert.',
    });
  }

  // 1.3.1 List structure
  {
    const bad = [];
    for (const list of root.querySelectorAll('ul, ol')) {
      for (const child of list.childNodes) {
        if (!child.rawTagName) continue;
        const tag = child.rawTagName.toLowerCase();
        if (!['li', 'script', 'template'].includes(tag)) {
          bad.push({ snippet: snippet(child), reason: `<${tag}> is a direct child of <${list.rawTagName.toLowerCase()}>. Only li is allowed.` });
        }
      }
    }
    add({
      check_id: 'list-structure',
      sc: '1.3.1',
      level: 'A',
      title: 'List contains non-list children',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS),
      fix: '<ul><li>Apples</li><li>Pears</li></ul>',
    });
  }

  // 4.1.2 iframe without a title
  {
    const bad = root.querySelectorAll('iframe').filter((el) => !(attr(el, 'title') || '').trim());
    add({
      check_id: 'iframe-title',
      sc: '4.1.2',
      level: 'A',
      title: 'Frame has no accessible name',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'Frames need a title attribute describing the embedded content.' })),
      fix: '<iframe title="Product demo video" src="..."></iframe>',
    });
  }

  // 1.3.1 Data tables without headers
  {
    const bad = [];
    for (const table of root.querySelectorAll('table')) {
      const isLayout = attr(table, 'role') === 'presentation' || attr(table, 'role') === 'none';
      if (isLayout) continue;
      if (!table.querySelector('th')) bad.push({ snippet: snippet(table), reason: 'No th cells. Data tables need header cells associated with each column or row.' });
    }
    add({
      check_id: 'table-headers',
      sc: '1.3.1',
      level: 'A',
      title: 'Data table has no header cells',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS),
      fix: '<table><tr><th scope="col">Plan</th></tr>...</table>',
    });
  }

  // 1.2.2 Captions for prerecorded video
  {
    const bad = root
      .querySelectorAll('video')
      .filter((el) => !el.querySelector('track') || !el.querySelectorAll('track').some((t) => (attr(t, 'kind') || '').toLowerCase() === 'captions'));
    add({
      check_id: 'video-captions',
      sc: '1.2.2',
      level: 'A',
      title: 'Video without a captions track',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS).map((el) => ({ snippet: snippet(el), reason: 'Add a track element with kind="captions". Accuracy still needs a human check.' })),
      fix: '<video controls><source src="demo.mp4"><track kind="captions" src="demo.en.vtt" srclang="en" label="English"></video>',
    });
  }

  // 1.4.4 Resize Text: viewport blocks zoom
  {
    const meta = root.querySelector('meta[name="viewport"]');
    const content = meta ? (attr(meta, 'content') || '').toLowerCase() : '';
    const blocked = /user-scalable\s*=\s*no/.test(content) || /maximum-scale\s*=\s*(0?\.\d+|1(\.0)?)\b/.test(content);
    add({
      check_id: 'viewport-zoom',
      sc: '1.4.4',
      level: 'AA',
      title: 'Viewport meta tag blocks pinch zoom',
      count: blocked ? 1 : 0,
      elements: blocked ? [{ snippet: snippet(meta), reason: 'user-scalable=no or maximum-scale=1 prevents magnification on mobile.' }] : [],
      fix: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    });
  }

  // 1.3.5 Identify Input Purpose
  {
    const purposeFields = ['email', 'tel', 'name', 'given-name', 'family-name', 'organization', 'street-address', 'address-line1', 'postal-code', 'country', 'username', 'current-password', 'new-password', 'cc-number', 'bday'];
    const bad = [];
    for (const el of root.querySelectorAll('input')) {
      const type = (attr(el, 'type') || 'text').toLowerCase();
      const autocomplete = (attr(el, 'autocomplete') || '').toLowerCase();
      const hint = `${type} ${attr(el, 'name') || ''} ${attr(el, 'id') || ''}`.toLowerCase();
      const needs = purposeFields.some((f) => hint.includes(f.split('-')[0]));
      if (!needs) continue;
      if (!autocomplete || autocomplete === 'off') {
        if (['hidden', 'submit', 'button', 'image', 'reset', 'checkbox', 'radio'].includes(type)) continue;
        bad.push({ snippet: snippet(el), reason: 'Common-purpose fields should declare an autocomplete token so autofill and assistive tech can identify the purpose.' });
      }
    }
    add({
      check_id: 'autocomplete-purpose',
      sc: '1.3.5',
      level: 'AA',
      title: 'Common-purpose input has no autocomplete token',
      count: bad.length,
      elements: bad.slice(0, MAX_ELEMENTS),
      fix: '<input type="email" name="email" autocomplete="email">',
    });
  }

  const checksRun = 18;
  return {
    findings,
    checks_run: checksRun,
    error_count: findings.reduce((sum, f) => sum + f.count, 0),
  };
}

export const AUTOMATED_COVERAGE = {
  criteria_total: 87,
  criteria_with_static_check: 12,
  criteria_with_axe_rule: 29,
  note: '58 of 87 WCAG 2.2 criteria have no automated rule at all and need manual review, assistive technology testing, or process evidence. At Level AA, the level the DOJ rule and EN 301 549 adopt, only 7 of 24 criteria have a rule. A clean static audit is not a conformance claim.',
};
