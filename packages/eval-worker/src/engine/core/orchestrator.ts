/**
 * Runs a profile: resolve each enabled pass, execute serially in profile
 * order (so `priorArtifacts` is well-defined and output is byte-stable),
 * then hand every artifact to the aggregator. This is the worker's one
 * entry point into the engine; `runEngine` remains the pure synchronous
 * façade for deterministic-only callers.
 */
import type { CanvasGraph } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import { buildGraphIndex } from '../graph-index';
import type { PromptFacts } from '../types';
import { aggregate, type AggregateResult } from './aggregator';
import type { EvidenceArtifact } from './artifacts';
import { describe, validateProfile, type EvalProfile } from './profile';
import type { EvalPass } from './types';

export interface EvaluationRun {
  /** Every artifact in production order — the persisted audit trail. */
  artifacts: EvidenceArtifact[];
  result: AggregateResult;
}

export interface RunEvaluationInput {
  graph: CanvasGraph;
  facts: PromptFacts;
  llm: LlmClient;
  profile: EvalProfile;
  registry: ReadonlyMap<string, EvalPass>;
}

export async function runEvaluation(input: RunEvaluationInput): Promise<EvaluationRun> {
  const { graph, facts, llm, profile, registry } = input;
  validateProfile(profile);

  const index = buildGraphIndex(graph);
  const artifacts: EvidenceArtifact[] = [];

  for (const config of profile.passes) {
    if (!config.enabled) continue;
    const pass = registry.get(config.pass);
    if (!pass) {
      throw new Error(`eval profile ${describe(profile)} names unknown pass: ${config.pass}`);
    }
    const produced = await pass.run({
      graph,
      facts,
      index,
      llm,
      priorArtifacts: artifacts,
      options: config.options ?? {},
    });
    artifacts.push(...produced);
  }

  return { artifacts, result: aggregate(artifacts, profile) };
}
