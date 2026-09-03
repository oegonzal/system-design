import type { CanvasGraph } from '@sysdesign/contracts';

import type { GradedEvidenceItem } from '../engine/core/artifacts';
import type { EngineFinding, PromptFacts } from '../engine/types';

export interface CritiqueResult {
  /** Grounded weaknesses as graded evidence — the engine's scorer turns these into a bounded subtraction. */
  items: GradedEvidenceItem[];
  /** Narrative for the evaluation header; null → the engine's summary stands. */
  summary: string | null;
  /** Model id that produced the critique, for the audit column. */
  model: string | null;
}

export interface CriticInput {
  graph: CanvasGraph;
  facts: PromptFacts;
  /** The design narrative submitted with the revision; null when absent. */
  narrative: string | null;
  /** What the deterministic passes already found — the critic must add, not repeat. */
  deterministicFindings: EngineFinding[];
}

/**
 * Critic failure is never fatal: implementations resolve to an empty critique
 * rather than throwing.
 */
export interface EvalCritic {
  review(input: CriticInput): Promise<CritiqueResult>;
}
