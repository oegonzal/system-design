import type { CanvasGraph, NodeKind } from './canvas';
import { NFR_KINDS, type NfrKind } from './prompts';

/**
 * Node labels the narrative never mentions.
 *
 * This module is the single source of truth for "does the narrative cover
 * the design": the eval engine's narrative expectations/rules and the UI's
 * live checklist call the same helpers, so a submission can never be graded
 * against a different notion of coverage than the one the author was shown.
 * All probes are deliberately conservative — literal case-insensitive
 * substrings, never fuzzy NLP.
 *
 * Pure. Returns the unique node labels (trimmed; empty/whitespace-only
 * labels skipped; duplicates — compared case-insensitively — counted once)
 * that do NOT appear in the narrative as a case-insensitive substring,
 * preserving first-appearance order in the graph.
 */
export function unmentionedNodeLabels(graph: CanvasGraph, narrative: string): string[] {
  const haystack = narrative.toLowerCase();
  const seen = new Set<string>();
  const unmentioned: string[] = [];

  for (const node of graph.nodes) {
    const label = node.label.trim();
    if (label.length === 0) continue;

    const needle = label.toLowerCase();
    if (seen.has(needle)) continue;
    seen.add(needle);

    if (!haystack.includes(needle)) unmentioned.push(label);
  }

  return unmentioned;
}

/** Verbs whose presence shows the story describes movement, not just parts. */
export const FLOW_VERBS = [
  'calls',
  'sends',
  'publishes',
  'consumes',
  'reads',
  'writes',
  'streams',
  'routes',
  'queues',
  'caches',
  'replicates',
  'drains',
] as const;

/** True when the narrative uses at least one flow verb — it narrates the arrows. */
export function hasFlowStory(narrative: string): boolean {
  const haystack = narrative.toLowerCase();
  return FLOW_VERBS.some((verb) => haystack.includes(verb));
}

/**
 * Per-NFR-kind vocabulary that counts as the narrative engaging with that
 * requirement. Lowercase substrings, stems where useful ('availab' covers
 * availability/available), chosen to be collision-safe against ordinary
 * design prose (no bare 'ms', 'bot', 'log' — and 'authent'/'authoriz'
 * rather than 'auth', which hides inside "author" and "authoritative").
 */
export const NFR_NARRATIVE_LEXICON = {
  latency: ['latency', 'p99', 'p95', 'response time', 'millisecond', 'hot path'],
  availability: ['availab', 'failover', 'uptime', 'downtime', 'outage'],
  consistency: [
    'consisten',
    'idempoten',
    'exactly once',
    'exactly-once',
    'oversell',
    'oversold',
    'transaction',
  ],
  durability: ['durab', 'never lost', 'persist', 'replay', 'backup', 'write-ahead'],
  throughput: [
    'throughput',
    'requests per second',
    'req/s',
    'rps',
    'burst',
    'backlog',
    'stampede',
    'spike',
  ],
  cost: ['cost', 'scale down', 'scale-down', 'scale to zero', 'off-peak', 'budget'],
  security: [
    'secur',
    'authent',
    'authoriz',
    'rate limit',
    'rate-limit',
    'encrypt',
    'waf',
    'credential',
  ],
  observability: ['observab', 'monitor', 'alert', 'metric', 'trace', 'on-call', 'dashboard'],
} as const satisfies Record<NfrKind, readonly string[]>;

/**
 * The prompt's NFR kinds the narrative never engages with, in canonical
 * `NFR_KINDS` order. A kind is addressed when any of its lexicon terms
 * appears in the narrative (case-insensitive substring).
 */
export function unaddressedNfrKinds(kinds: readonly NfrKind[], narrative: string): NfrKind[] {
  const present = new Set(kinds);
  const haystack = narrative.toLowerCase();
  return NFR_KINDS.filter(
    (kind) =>
      present.has(kind) && !NFR_NARRATIVE_LEXICON[kind].some((term) => haystack.includes(term)),
  );
}

/**
 * Mechanism words that claim infrastructure. Each term is a capability the
 * prose asserts; the claim is honest when the diagram draws any of the
 * listed kinds (a CDN legitimately "caches", a stream legitimately
 * "queues"). Terms are 1:1-unambiguous phrases only — nothing that ordinary
 * prose uses for other meanings.
 */
export const PHANTOM_MECHANISMS = [
  { term: 'cache', kinds: ['cache', 'cdn'] },
  { term: 'queue', kinds: ['queue', 'event-stream', 'pub-sub'] },
  { term: 'cdn', kinds: ['cdn'] },
  { term: 'load balancer', kinds: ['load-balancer'] },
  { term: 'read replica', kinds: ['replica'] },
  { term: 'search index', kinds: ['search-index'] },
  { term: 'object store', kinds: ['object-store'] },
  { term: 'event stream', kinds: ['event-stream'] },
] as const satisfies readonly { term: string; kinds: readonly NodeKind[] }[];

/**
 * Mechanism terms the narrative claims but the diagram never draws — the
 * story promises a cache, a queue, a load balancer that does not exist.
 * Returns the offending terms in `PHANTOM_MECHANISMS` order.
 */
export function phantomMechanismTerms(graph: CanvasGraph, narrative: string): string[] {
  const haystack = narrative.toLowerCase();
  const drawn = new Set(graph.nodes.map((node) => node.kind));
  return PHANTOM_MECHANISMS.filter(
    ({ term, kinds }) => haystack.includes(term) && !kinds.some((kind) => drawn.has(kind)),
  ).map(({ term }) => term);
}
