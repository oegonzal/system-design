import type { NodeKind } from './canvas';
import type { MechanismClaim } from './mechanisms';

/**
 * The design brief: the author's answer to "which part of your design holds
 * which requirement, and how does a request actually travel".
 *
 * It is the graded half of explaining a design. The prose walkthrough stays on
 * the revision beside it — read by a human, critiqued by the LLM pass, and
 * deliberately not scored, because nothing deterministic can judge writing
 * without falling back on the substring heuristics this replaced.
 *
 * Every field here is a REFERENCE into artifacts the system already owns: node
 * ids, edge ids, an NFR id from the prompt, an ordinal into its functional
 * requirements, and a mechanism from a closed vocabulary. Nothing is matched as
 * text, so the grade survives renaming a component or rewording a requirement.
 */

/** One requirement, the components that hold it, and how. */
export interface NfrBinding {
  /** An `id` from the prompt's `nonFunctionalRequirements`. */
  nfrId: string;
  /** The components the author says carry this requirement. */
  nodeIds: string[];
  mechanism: MechanismClaim;
  /**
   * The author's reasoning, in their own words. ADVISORY: no scoring predicate
   * may read this. It is the back door the heuristics would return through.
   */
  note?: string;
}

/** One functional requirement, traced as a walk through the diagram. */
export interface FlowBinding {
  id: string;
  /**
   * Index into the prompt's `functionalRequirements` — an ordinal, never the
   * sentence, so rewording a requirement cannot break a stored brief.
   */
  requirementIndex: number;
  /** Ordered edge ids forming a connected walk. */
  path: string[];
  /** Advisory, as `NfrBinding.note`. */
  note?: string;
}

export interface DesignBrief {
  /** Bumped only if the shape changes incompatibly; stored briefs record theirs. */
  version: 1;
  nfrBindings: NfrBinding[];
  flows: FlowBinding[];
}

export const DESIGN_BRIEF_VERSION = 1;

/**
 * Where a traced flow has to end for the walk to mean anything, and which
 * components are exempt from needing to be accounted for.
 *
 * Both live here rather than in the eval engine because the brief editor has to
 * guide the author by the SAME vocabulary the grade uses. A UI that told an
 * author their flow was complete while the engine disagreed would be the exact
 * defect this whole artifact replaced — a claim nothing keeps in sync.
 *
 * Note the deliberate difference from the module-private durable set in
 * `mechanisms.ts`: that one answers "what may back a cache", this one answers
 * "where may a request come to rest". Same-looking lists, different questions.
 */
export const FLOW_SINK_KINDS: readonly NodeKind[] = [
  'database',
  'replica',
  'object-store',
  'data-warehouse',
  'data-lake',
  'time-series-db',
  'kv-store',
  'search-index',
];

/** Observability blocks annotate a design; nothing routes through them. */
export const ANNOTATION_KINDS: readonly NodeKind[] = ['monitoring', 'logging', 'tracing'];

export const BRIEF_MAX_NFR_BINDINGS = 24;
export const BRIEF_MAX_FLOWS = 12;
/** A binding naming more components than this is not a claim, it is a shrug. */
export const BINDING_MAX_NODES = 12;
export const FLOW_MAX_STEPS = 24;
export const BINDING_NOTE_MAX_LENGTH = 200;

/**
 * True when the brief carries something worth grading. Tracing a flow is an
 * explanation even with no binding beside it, so either half counts.
 */
export function briefHasClaims(brief: DesignBrief | null): boolean {
  return brief !== null && (brief.nfrBindings.length > 0 || brief.flows.length > 0);
}
