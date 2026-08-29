/**
 * The engine's internal contract. Pure types only — the engine is importable
 * from a unit test with zero setup, so nothing here may pull in Nest, the ORM,
 * or any I/O.
 */
import type {
  Archetype,
  CanvasGraph,
  DimensionScores,
  EvalDimension,
  Grade,
  GraphPatch,
  NfrKind,
  NfrTargetSpec,
  PromptDifficulty,
  ScaleTargets,
  Severity,
} from '@sysdesign/contracts';

import type { GraphIndex } from './graph-index';

/** One prompt NFR, normalized: statements and targets reach the rules intact. */
export interface NfrFact {
  id: string;
  kind: NfrKind;
  statement: string;
  target: string | null;
  targetSpec: NfrTargetSpec | null;
}

/**
 * Everything the rules are allowed to know about the prompt, extracted once by
 * the caller. Keeping this a plain bag of facts (rather than the full
 * PromptDto) is what lets the engine stay pure and trivially testable.
 */
export interface PromptFacts {
  archetype: Archetype;
  difficulty: PromptDifficulty;
  scaleTargets: ScaleTargets;
  /** Distinct NFR kinds — the cheap gate most predicates need. */
  nfrKinds: NfrKind[];
  /** The full NFR list, so findings can cite the exact requirement missed. */
  nfrs: NfrFact[];
  /** Functional requirements joined and lowercased, for keyword probes. */
  functionalText: string;
}

/** One lesson: what is wrong, why it matters at this scale, and (sometimes) a machine-applicable fix. */
export interface RuleFinding {
  ruleId: string;
  dimension: EvalDimension;
  severity: Severity;
  title: string;
  /** 1–3 sentences explaining WHY at the prompt's scale, not just what to change. */
  message: string;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  suggestion: GraphPatch | null;
}

/**
 * A finding as the aggregator sees it, from any deterministic pass. Rule
 * violations subtract points (`countsAsViolation`); unmet expectations do not
 * — their absence already reduced the coverage base, and charging both would
 * grade one lesson twice. Exactly one of ruleId/expectationId is set.
 */
export interface EngineFinding extends Omit<RuleFinding, 'ruleId'> {
  ruleId: string | null;
  countsAsViolation: boolean;
  /** Set when the finding reports an unmet expectation (`exp.*`). */
  expectationId: string | null;
  /** The prompt NFR this finding proves unmet, when one motivated it. */
  nfrId: string | null;
}

export interface RuleContext {
  graph: CanvasGraph;
  facts: PromptFacts;
  index: GraphIndex;
  /**
   * The design narrative submitted with the revision, or null when the author
   * wrote none. Rules that read it must feature-gate on its presence — a
   * canvas submitted without prose is graded exactly as before.
   */
  narrative: string | null;
}

/** A rule owns one lesson; severity is decided per finding, not per rule. */
export interface EvalRule {
  id: string;
  dimension: EvalDimension;
  /** The requirement kind this rule enforces; used to resolve nfrId on findings. */
  nfrKind?: NfrKind;
  check(ctx: RuleContext): RuleFinding[];
}

export interface EngineResult {
  findings: EngineFinding[];
  dimensionScores: DimensionScores;
  overallScore: number;
  grade: Grade;
  summary: string;
}
