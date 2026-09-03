import { describe, expect, it } from 'vitest';

import type {
  AxisArtifact,
  DiagnosticsArtifact,
  GradedEvidenceArtifact,
} from '../../core/artifacts';
import type { PassContext } from '../../core/types';
import { buildGraphIndex } from '../../graph-index';
import { fakeLlm, flashSaleFacts, orderHistoryFacts } from '../../testing';
import { createWorkabilityPass } from './workability.pass';
import { factorsToDisplay, type WorkabilityCritique } from './workability-schema';

const graph = { nodes: [], edges: [] };

function contextWith(overrides: Partial<PassContext>): PassContext {
  return {
    graph,
    facts: orderHistoryFacts(),
    index: buildGraphIndex(graph),
    narrative: null,
    brief: null,
    narration: null,
    llm: fakeLlm(null),
    priorArtifacts: [],
    options: {},
    ...overrides,
  };
}

const critique: WorkabilityCritique = {
  factors: {
    objectiveAlignment: { level: 'high', rationale: 'The read model serves the account page.' },
    completeness: { level: 'medium', rationale: 'Refund amendment is modelled; disputes are not.' },
    feasibility: { level: 'high', rationale: 'The declared flows run as drawn.' },
    risk: { level: 'low', rationale: 'Replay duplicates are the main residual exposure.' },
    futureGain: { level: 'medium', rationale: 'The event stream leaves room for new consumers.' },
  },
  weaknesses: [
    {
      requirementId: 'ing-shopify-webhooks',
      factor: 'feasibility',
      weakness: 'high',
      confidence: 'medium',
      affectedComponents: [],
      rationale: 'No idempotency on the webhook path; a Shopify retry double-indexes the order.',
    },
    {
      // A workflow item the spec does not declare is re-checked to null.
      requirementId: 'op-does-not-exist',
      factor: 'completeness',
      weakness: 'low',
      confidence: 'low',
      affectedComponents: [],
      rationale: 'A speculative gap.',
    },
  ],
  summary: 'Model the dispute path next.',
};

describe('llm.workability', () => {
  it('[PRD-6] reports ordinal factors with rationales, mapped deterministically for display — and never emits findings or coverage', async () => {
    const pass = createWorkabilityPass();
    const artifacts = await pass.run(contextWith({ llm: fakeLlm(critique) }));

    expect(
      artifacts.every(
        (artifact) =>
          artifact.kind === 'axis' ||
          artifact.kind === 'diagnostics' ||
          artifact.kind === 'graded-evidence',
      ),
    ).toBe(true);
    const axis = artifacts.find((artifact) => artifact.kind === 'axis') as AxisArtifact;
    expect(axis.factors?.map((factor) => `${factor.id}:${factor.level}`)).toEqual([
      'objectiveAlignment:high',
      'completeness:medium',
      'feasibility:high',
      'risk:low',
      'futureGain:medium',
    ]);
    expect(axis.factors?.every((factor) => factor.rationale.length > 0)).toBe(true);
    // Ordinals → numbers is post-processing, and risk inverts to containment.
    expect(axis.subScores).toEqual({
      objectiveAlignment: 100,
      completeness: 67,
      feasibility: 100,
      riskContainment: 67,
      futureGain: 67,
    });
    expect(axis.score).toBe(factorsToDisplay(critique).score);
    // mode:'llm' — enforceMode would strip findings/coverage; the pass emits none to strip.
    expect(pass.mode).toBe('llm');
  });

  it('[EVAL-16] emits its grounded shortfalls as graded evidence, mapped lens→dimension', async () => {
    const pass = createWorkabilityPass();
    const artifacts = await pass.run(contextWith({ llm: fakeLlm(critique) }));
    const graded = artifacts.find(
      (artifact) => artifact.kind === 'graded-evidence',
    ) as GradedEvidenceArtifact;

    expect(graded.lens).toBe('evaluator.workability');
    expect(graded.items).toHaveLength(2);
    // feasibility → reliability, magnitude and confidence carried, grounded to the item.
    expect(graded.items[0]).toMatchObject({
      dimension: 'reliability',
      level: 'high',
      confidence: 'medium',
      requirementId: 'ing-shopify-webhooks',
    });
    // The undeclared workflow item is re-checked to null grounding.
    expect(graded.items[1]?.requirementId).toBeNull();
  });

  it('skips as not-applicable on a prompt without a workflow spec', async () => {
    const pass = createWorkabilityPass();
    const artifacts = await pass.run(
      contextWith({ facts: flashSaleFacts(), llm: fakeLlm(critique) }),
    );
    const diagnostic = artifacts[0] as DiagnosticsArtifact;
    expect(diagnostic.kind).toBe('diagnostics');
    expect(diagnostic.reason).toBe('not-applicable');
  });

  it('reports llm-disabled under the deterministic pin, so a spec-less run says why there is no axis', async () => {
    const pass = createWorkabilityPass();
    const disabled = { ...fakeLlm(critique), enabled: false };
    const artifacts = await pass.run(contextWith({ llm: disabled }));
    expect((artifacts[0] as DiagnosticsArtifact).reason).toBe('llm-disabled');
  });
});
