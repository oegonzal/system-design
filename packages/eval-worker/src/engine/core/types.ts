/**
 * The pass port. A pass is one evaluation strategy — a rule sweep, an
 * expectation checklist, an LLM axis — that turns the shared context into
 * evidence artifacts. Passes compose declaratively through an EvalProfile;
 * they never talk to each other except through `priorArtifacts`.
 */
import type { CanvasGraph, DesignBrief, NarrationFacts } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { GraphIndex } from '../graph-index';
import type { PromptFacts } from '../types';
import type { EvidenceArtifact } from './artifacts';

export interface PassContext {
  graph: CanvasGraph;
  facts: PromptFacts;
  index: GraphIndex;
  /** The walkthrough submitted with the revision; null when absent. Advisory. */
  narrative: string | null;
  /** The graded explanation: requirement bindings and traced flows. */
  brief: DesignBrief | null;
  /** The typed projection of the narrative the deterministic grade reads; null when absent. */
  narration: NarrationFacts | null;
  /** The no-op client when LLM work is disabled — passes check `enabled`. */
  llm: LlmClient;
  /** Evidence from earlier passes in profile order (e.g. findings to dedupe against). */
  priorArtifacts: readonly EvidenceArtifact[];
  /** This pass's options from the profile entry. */
  options: Record<string, unknown>;
}

export interface EvalPass {
  id: string;
  mode: 'deterministic' | 'llm';
  /**
   * Must not throw: deterministic passes are pure functions of (graph, facts),
   * and LLM passes resolve to a DiagnosticsArtifact on any failure.
   */
  run(ctx: PassContext): Promise<EvidenceArtifact[]>;
}
