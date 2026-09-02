import { describe, expect, it } from 'vitest';

import type { AxisArtifact, DiagnosticsArtifact } from '../../core/artifacts';
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
  summary: 'Model the dispute path next.',
};

describe('llm.workability', () => {
  it('[PRD-6] reports ordinal factors with rationales, mapped deterministically for display — and never emits findings or coverage', async () => {
    const pass = createWorkabilityPass();
    const artifacts = await pass.run(contextWith({ llm: fakeLlm(critique) }));

    expect(
      artifacts.every((artifact) => artifact.kind === 'axis' || artifact.kind === 'diagnostics'),
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
