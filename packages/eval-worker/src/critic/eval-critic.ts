import type { CanvasGraph, EvalDimension, Severity } from '@sysdesign/contracts';

import type { EngineFinding, PromptFacts } from '../engine/types';

/** A finding the critic (LLM) contributed. Never carries a ruleId or patch. */
export interface CriticFinding {
  dimension: EvalDimension;
  severity: Severity;
  title: string;
  message: string;
  affectedNodeIds: string[];
}

export interface CritiqueResult {
  findings: CriticFinding[];
  /** Narrative for the evaluation header; null → the engine's summary stands. */
  summary: string | null;
  /** Model id that produced the critique, for the audit column. */
  model: string | null;
}

export interface CriticInput {
  graph: CanvasGraph;
  facts: PromptFacts;
  /** What the deterministic passes already found — the critic must add, not repeat. */
  deterministicFindings: EngineFinding[];
}

/**
 * Abstract class rather than an interface so it can double as the Nest
 * injection token. Critic failure is never fatal: implementations resolve to
 * an empty critique rather than throwing.
 */
export abstract class EvalCritic {
  abstract review(input: CriticInput): Promise<CritiqueResult>;
}
