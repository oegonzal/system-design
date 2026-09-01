import type { CanvasGraph, NodeConfig, NodeKind } from './canvas';
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

/**
 * The mirror of `phantomMechanismTerms`. That probe catches a story claiming
 * a mechanism the diagram never draws; this one catches the opposite lie —
 * a story that DENIES a capability the diagram explicitly configures. Naming
 * only drawn components is enough to slip past every other probe here, so
 * without this check a narrative can contradict its own diagram in every
 * sentence and still score full marks.
 */
export interface ConfigContradiction {
  /** Human name of the capability, as the finding will phrase it. */
  readonly capability: string;
  /** Phrases asserting the capability is ABSENT. Conservative and literal. */
  readonly phrases: readonly string[];
  /** Node kinds whose config can declare this capability. */
  readonly kinds: readonly NodeKind[];
  /** True when a node's config declares the capability present. */
  readonly declaredBy: (config: NodeConfig) => boolean;
}

export const CONFIG_CONTRADICTIONS: readonly ConfigContradiction[] = [
  {
    capability: 'rate limiting',
    phrases: ['no rate limiting', 'no rate limits', 'without rate limiting', 'does not rate limit'],
    kinds: ['gateway', 'load-balancer', 'notification-service'],
    declaredBy: (config) => config['rateLimit'] === true,
  },
  {
    capability: 'authentication at the boundary',
    phrases: [
      'no authentication',
      'without authentication',
      'authenticates nobody',
      'does not authenticate',
      'checks no credential',
    ],
    kinds: ['gateway'],
    declaredBy: (config) => typeof config['authMode'] === 'string' && config['authMode'] !== 'none',
  },
  {
    capability: 'strong consistency',
    phrases: ['eventually consistent', 'eventual consistency'],
    kinds: ['database', 'kv-store'],
    declaredBy: (config) => config['consistency'] === 'strong',
  },
  {
    capability: 'backups',
    phrases: ['no backups', 'no backup', 'without backups'],
    kinds: ['database'],
    declaredBy: (config) => config['backups'] === true,
  },
  {
    capability: 'multi-region replication',
    phrases: ['single-region', 'single region', 'one region only'],
    kinds: ['database'],
    declaredBy: (config) => config['multiRegion'] === true,
  },
  {
    capability: 'sharding',
    phrases: ['unsharded', 'not sharded', 'no sharding'],
    kinds: ['database'],
    declaredBy: (config) => config['sharding'] === 'hash' || config['sharding'] === 'range',
  },
  {
    capability: 'idempotent processing',
    phrases: ['not idempotent', 'non-idempotent'],
    kinds: ['worker', 'service', 'batch-job'],
    declaredBy: (config) => config['idempotent'] === true,
  },
  {
    capability: 'a dead-letter queue',
    phrases: ['no dead-letter', 'no dead letter', 'without a dead-letter', 'no dlq'],
    kinds: ['queue'],
    declaredBy: (config) => config['dlq'] === true,
  },
  {
    capability: 'at-least-once delivery with retries',
    phrases: ['fire-and-forget', 'fire and forget', 'no retries', 'without retries'],
    kinds: ['queue'],
    declaredBy: (config) =>
      config['delivery'] === 'at-least-once' || typeof config['maxRetries'] === 'number',
  },
  {
    capability: 'a retention window',
    phrases: ['retains nothing', 'no retention', 'without retention'],
    kinds: ['event-stream'],
    declaredBy: (config) => typeof config['retentionHours'] === 'number',
  },
  {
    capability: 'autoscaling',
    phrases: ['no autoscaling', 'without autoscaling', 'does not autoscale'],
    kinds: ['service'],
    declaredBy: (config) => config['autoscaling'] === true,
  },
];

export interface ContradictedCapability {
  capability: string;
  /** The phrase found in the prose, so the finding can quote the author. */
  phrase: string;
  nodeIds: string[];
  labels: string[];
}

/**
 * Capabilities the diagram configures that the narrative denies, in
 * `CONFIG_CONTRADICTIONS` order. One entry per capability however many
 * phrases or nodes matched.
 */
export function contradictedCapabilities(
  graph: CanvasGraph,
  narrative: string,
): ContradictedCapability[] {
  const haystack = narrative.toLowerCase();
  const contradicted: ContradictedCapability[] = [];

  for (const entry of CONFIG_CONTRADICTIONS) {
    const phrase = entry.phrases.find((candidate) => haystack.includes(candidate));
    if (phrase === undefined) continue;
    const declaring = graph.nodes.filter(
      (node) => entry.kinds.includes(node.kind) && entry.declaredBy(node.config ?? {}),
    );
    if (declaring.length === 0) continue;
    contradicted.push({
      capability: entry.capability,
      phrase,
      nodeIds: declaring.map((node) => node.id),
      labels: [...new Set(declaring.map((node) => node.label.trim()).filter(Boolean))],
    });
  }

  return contradicted;
}

/**
 * Does the narrative read as prose, or as a list of the words the checks look
 * for? Every other probe in this module is a substring test, which a bare
 * keyword list satisfies perfectly — so this one grades SHAPE: real sentences,
 * and the connective tissue that only sentences have. Deliberately coarse; it
 * raises the floor rather than judging quality, which no substring can.
 */
const FUNCTION_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'so',
  'that',
  'which',
  'this',
  'these',
  'those',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'they',
  'their',
  'them',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'from',
  'with',
  'into',
  'through',
  'across',
  'before',
  'after',
  'while',
  'when',
  'if',
  'then',
  'than',
  'as',
  'by',
  'not',
  'no',
  'each',
  'every',
  'any',
  'all',
  'both',
  'because',
  'has',
  'have',
  'does',
  'do',
]);

/**
 * A narrative needs at least this many real sentences to be prose. Two, not
 * three: terse prose is still prose, and the function-word floor below is
 * what actually separates writing from a keyword list.
 */
export const MIN_PROSE_SENTENCES = 2;
/** Below this a "sentence" is a fragment, not an explanation. */
const MIN_SENTENCE_WORDS = 6;
/** Function-word share of ordinary English prose sits far above this floor. */
const MIN_FUNCTION_WORD_RATIO = 0.12;

export function readsAsProse(narrative: string): boolean {
  const words = narrative.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
  if (words.length === 0) return false;

  const sentences = narrative
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => (sentence.match(/\S+/g) ?? []).length >= MIN_SENTENCE_WORDS);
  if (sentences.length < MIN_PROSE_SENTENCES) return false;

  const connective = words.filter((word) => FUNCTION_WORDS.has(word)).length;
  return connective / words.length >= MIN_FUNCTION_WORD_RATIO;
}
