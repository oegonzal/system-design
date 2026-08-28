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
  PromptDifficulty,
  ScaleTargets,
  Severity,
} from '@sysdesign/contracts';

import type { GraphIndex } from './graph-index';

/**
 * Everything the rules are allowed to know about the prompt, extracted once by
 * the caller. Keeping this a plain bag of facts (rather than the full
 * PromptDto) is what lets the engine stay pure and trivially testable.
 */
export interface PromptFacts {
  archetype: Archetype;
  difficulty: PromptDifficulty;
  scaleTargets: ScaleTargets;
  nfrKinds: NfrKind[];
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

export interface RuleContext {
  graph: CanvasGraph;
  facts: PromptFacts;
  index: GraphIndex;
}

/** A rule owns one lesson; severity is decided per finding, not per rule. */
export interface EvalRule {
  id: string;
  dimension: EvalDimension;
  check(ctx: RuleContext): RuleFinding[];
}

export interface EngineResult {
  findings: RuleFinding[];
  dimensionScores: DimensionScores;
  overallScore: number;
  grade: Grade;
  summary: string;
}
