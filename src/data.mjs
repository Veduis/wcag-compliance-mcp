import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');

const read = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));

export const criteria = read('criteria.json');
export const pairs = read('pairs.json');
export const timeline = read('timeline.json');

export const criteriaById = new Map(criteria.map((c) => [c.sc_id, c]));
export const pairsById = new Map(pairs.map((p) => [p.pair_id, p]));

export function searchCriteria(query, { level, limit = 5 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return criteria.slice(0, limit);
  const scored = [];
  for (const c of criteria) {
    if (level && c.level.toLowerCase() !== String(level).toLowerCase()) continue;
    let score = 0;
    if (c.sc_id === q) score = 100;
    else if (c.sc_id.startsWith(q)) score = 80;
    else if (c.name.toLowerCase() === q) score = 90;
    else if (c.name.toLowerCase().includes(q)) score = 60;
    else if (c.summary.toLowerCase().includes(q)) score = 30;
    else if (c.guideline.toLowerCase().includes(q)) score = 20;
    else if ((c.axe_core_rules || []).some((r) => r.toLowerCase().includes(q))) score = 25;
    if (score) scored.push({ c, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.c.sc_id.localeCompare(b.c.sc_id))
    .slice(0, limit)
    .map((s) => s.c);
}

export function findPairs({ sc_id, query, limit = 3 } = {}) {
  if (sc_id) return pairs.filter((p) => p.sc_id === String(sc_id).trim()).slice(0, limit);
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return pairs.filter((p) => `${p.title} ${p.sc_name} ${p.sc_id} ${p.explanation}`.toLowerCase().includes(q)).slice(0, limit);
}

const ENTITY_PROFILES = {
  title_ii_large: {
    label: 'U.S. state or local government, population 50,000 or more',
    keywords: ['state and local', 'public entit', 'title ii', 'population of 50,000', '50,000 or more'],
  },
  title_ii_small: {
    label: 'U.S. state or local government, population under 50,000, or a special district',
    keywords: ['state and local', 'public entit', 'title ii', 'under 50,000', 'special district'],
  },
  title_iii_business: {
    label: 'U.S. private business open to the public',
    keywords: ['private', 'public accommodation', 'title iii', 'business'],
  },
  federal_contractor: {
    label: 'U.S. federal agency or federal contractor',
    keywords: ['federal', 'section 508', 'procurement', 'agency'],
  },
  hhs_recipient: {
    label: 'Recipient of federal healthcare funding (HHS Section 504)',
    keywords: ['hhs', 'section 504', 'health', 'recipient'],
  },
  eu_business: {
    label: 'Business selling into the European Union',
    keywords: ['eu', 'european', 'eaa'],
  },
  ontario: {
    label: 'Ontario organization covered by AODA',
    keywords: ['ontario', 'aoda'],
  },
  unknown: { label: 'Unspecified entity', keywords: [] },
};

export const entityTypes = Object.keys(ENTITY_PROFILES);

function profileMatches(event, profile) {
  if (!profile.keywords.length) return true;
  const blob = `${event.event} ${event.applies_to} ${event.jurisdiction} ${event.authority} ${event.summary} ${event.technical_standard}`.toLowerCase();
  return profile.keywords.some((k) => blob.includes(k.toLowerCase()));
}

export function deadlinesFor(entityType, { asOf = new Date().toISOString().slice(0, 10), horizonYears = 4 } = {}) {
  const profile = ENTITY_PROFILES[entityType] || ENTITY_PROFILES.unknown;
  const asOfDate = new Date(asOf + 'T00:00:00Z');
  const horizon = new Date(asOfDate.getTime() + horizonYears * 365 * 24 * 60 * 60 * 1000);
  const days = (iso) => Math.round((new Date(iso + 'T00:00:00Z') - asOfDate) / 86400000);

  const relevant = timeline
    .filter((e) => profileMatches(e, profile))
    .map((e) => ({ ...e, days_from_as_of: days(e.date) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = relevant.filter((e) => e.days_from_as_of >= 0 && new Date(e.date + 'T00:00:00Z') <= horizon);
  const passed = relevant.filter((e) => e.days_from_as_of < 0);

  const binding = (e) => /rule|regulation|deadline|standard|court|law|statute/i.test(e.category);

  return {
    entity_type: entityType,
    entity_label: profile.label,
    as_of: asOf,
    current_baseline: passed.filter((e) => ['rule', 'regulation', 'court', 'statute', 'standard'].includes(e.category)).slice(-3),
    next_deadlines: upcoming.filter(binding).slice(0, 6),
    all_upcoming: upcoming.slice(0, 10),
    note:
      entityType === 'title_iii_business'
        ? 'ADA Title III has no administrative deadline and no regulatory grace period. The practical obligation is immediate and is driven by demand letters and litigation under WCAG 2.1 AA, which remains the de facto benchmark.'
        : 'Dates come from the sourced regulatory timeline. Confirm current status before relying on any date for a filing or procurement decision.',
  };
}

export { ENTITY_PROFILES };
