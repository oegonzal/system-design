import type { CanvasGraph } from './canvas';

/**
 * The design narrative: the author's walkthrough of the design, in prose — but
 * anchored to references, not left as one free-text box.
 *
 * The narrative used to be free prose the engine ignored, because grading prose
 * meant substring probes ("does the word cache appear"), which measured the
 * text rather than the design and which a pasted keyword list satisfied
 * perfectly. This artifact fixes that the way the brief did: each slot is keyed
 * to a REFERENCE the system already owns — a node id, an ordinal into the
 * prompt's functional requirements — so "explains this component" becomes a
 * grounded reference check, and "reads as an explanation" a shape check
 * (`readsAsProse`), neither of which a keyword dump can fake.
 *
 * The brief says WHICH component holds WHICH requirement (structure); the
 * narrative says WHY each component is there and narrates each flow (prose).
 * Complementary layers over the same references.
 */

export const NARRATION_VERSION = 1;
/** Per-slot prose ceiling — a rationale is a paragraph, not an essay. */
export const NARRATION_PROSE_MAX_LENGTH = 600;
export const NARRATION_OVERVIEW_MAX_LENGTH = 1200;
export const NARRATION_MAX_COMPONENT_RATIONALES = 40;
export const NARRATION_MAX_FLOW_NARRATIONS = 12;

/** Why one component is in the design, keyed to its node id. */
export interface ComponentRationale {
  nodeId: string;
  prose: string;
}

/** How a request travels for one functional requirement, keyed to its ordinal. */
export interface FlowNarration {
  /** Index into the prompt's `functionalRequirements` — never the sentence. */
  requirementIndex: number;
  prose: string;
}

export interface DesignNarrative {
  version: 1;
  /** The big-picture "why this shape". */
  overview?: string;
  componentRationales: ComponentRationale[];
  flowNarrations: FlowNarration[];
}

/* ─── the prose shape gate ────────────────────────────────────────────── */

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

/** Two, not three: terse prose is still prose; the function-word floor is what separates writing from a keyword list. */
export const MIN_PROSE_SENTENCES = 2;
/** Below this a "sentence" is a fragment, not an explanation. */
const MIN_SENTENCE_WORDS = 6;
/** Function-word share of ordinary English prose sits far above this floor. */
const MIN_FUNCTION_WORD_RATIO = 0.12;

/**
 * True when text reads as a genuine explanation rather than a keyword dump: at
 * least two real sentences and a function-word share only continuous prose
 * reaches. Shape, not content — it cannot be gamed by pasting component names,
 * and it never reads the text for WHAT it says, only HOW it is written.
 *
 * The decimal fix: "99.99% uptime" used to split into two fragments on the
 * period and fail an honest narrative. Digit.digit is masked before the
 * sentence split so a number never ends a sentence.
 */
export function readsAsProse(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
  if (words.length === 0) return false;

  const forSplit = text.replace(/(\d)[.](\d)/g, '$1․$2');
  const sentences = forSplit
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => (sentence.match(/\S+/g) ?? []).length >= MIN_SENTENCE_WORDS);
  if (sentences.length < MIN_PROSE_SENTENCES) return false;

  const connective = words.filter((word) => FUNCTION_WORDS.has(word)).length;
  return connective / words.length >= MIN_FUNCTION_WORD_RATIO;
}

/** True when the narrative carries any slot worth grading. */
export function narrationHasClaims(narration: DesignNarrative | null): boolean {
  if (narration === null) return false;
  return (
    (narration.overview?.trim().length ?? 0) > 0 ||
    narration.componentRationales.some((r) => r.prose.trim().length > 0) ||
    narration.flowNarrations.some((f) => f.prose.trim().length > 0)
  );
}

/* ─── the typed projection scoring reads ──────────────────────────────── */

/**
 * What the deterministic grade is allowed to know about the narrative: which
 * references carry SUBSTANTIVE prose, never the prose itself. The engine reads
 * this typed object, exactly as it reads `functionalCapabilities` and never the
 * raw `functionalText` — so the grounded-scoring ban on reading prose in a
 * scoring predicate holds, because the raw string never reaches one.
 */
export interface NarrationFacts {
  /** Any substantive slot exists at all. */
  present: boolean;
  overviewSubstantive: boolean;
  /** Node ids (on the graph) whose rationale reads as prose. Sorted, unique. */
  explainedNodeIds: string[];
  /** Functional-requirement ordinals whose narration reads as prose. Sorted, unique. */
  narratedRequirementIndexes: number[];
}

function uniqueSorted<T>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

/**
 * Project a narrative to the typed facts the engine grades. Pure and total: a
 * rationale for a node not on the graph is dropped (a stale reference is not a
 * claim), and only prose that clears the shape gate counts. This lives in
 * contracts — which the grounded-scoring gate does not scan — and returns a
 * typed object, so scoring never touches the raw string.
 */
export function projectNarration(
  narration: DesignNarrative | null,
  graph: CanvasGraph,
): NarrationFacts {
  if (narration === null) {
    return {
      present: false,
      overviewSubstantive: false,
      explainedNodeIds: [],
      narratedRequirementIndexes: [],
    };
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const overviewSubstantive = narration.overview !== undefined && readsAsProse(narration.overview);
  const explainedNodeIds = uniqueSorted(
    narration.componentRationales
      .filter((r) => nodeIds.has(r.nodeId) && readsAsProse(r.prose))
      .map((r) => r.nodeId),
  );
  const narratedRequirementIndexes = uniqueSorted(
    narration.flowNarrations
      .filter((f) => f.requirementIndex >= 0 && readsAsProse(f.prose))
      .map((f) => f.requirementIndex),
  );
  return {
    present:
      overviewSubstantive || explainedNodeIds.length > 0 || narratedRequirementIndexes.length > 0,
    overviewSubstantive,
    explainedNodeIds,
    narratedRequirementIndexes,
  };
}
