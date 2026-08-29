import { describe, expect, it } from 'vitest';

import { NoopLlmClient } from '@sysdesign/llm';

import type { PassContext } from '../../core/types';
import { buildGraphIndex } from '../../graph-index';
import { fakeLlm, flashSaleFacts, graph, node } from '../../testing';
import { createDepthPass } from './depth.pass';

function contextWith(llm: PassContext['llm']): PassContext {
  const canvas = graph([node('n-1', 'client'), node('n-2', 'service')]);
  return {
    graph: canvas,
    facts: flashSaleFacts(),
    index: buildGraphIndex(canvas),
    llm,
    priorArtifacts: [
      {
        passId: 'expectations.banks',
        kind: 'coverage',
        entries: [
          {
            expectationId: 'exp.fst.db-failover',
            dimension: 'reliability',
            weight: 2,
            met: false,
            nfrId: null,
            evidenceNodeIds: [],
            evidenceEdgeIds: [],
          },
        ],
      },
    ],
    options: {},
  };
}

const CANNED = {
  depthScore: 61,
  subScores: {
    tradeoffArticulation: 55,
    bottleneckAwareness: 70,
    failureDesign: 50,
    dataFlowClarity: 68,
  },
  summary: 'Mechanisms are named but capacities are defaulted.',
};

describe('depth pass', () => {
  it('degrades to a diagnostics artifact when the LLM is disabled', async () => {
    const artifacts = await createDepthPass().run(contextWith(new NoopLlmClient()));
    expect(artifacts).toEqual([
      {
        passId: 'llm.depth',
        kind: 'diagnostics',
        skipped: true,
        reason: 'llm-disabled',
        detail: null,
      },
    ]);
  });

  it('emits an axis artifact from a structured critique', async () => {
    const artifacts = await createDepthPass().run(contextWith(fakeLlm(CANNED)));
    expect(artifacts).toEqual([
      {
        passId: 'llm.depth',
        kind: 'axis',
        axisId: 'depth',
        label: 'Depth & justification',
        score: 61,
        subScores: CANNED.subScores,
        summary: CANNED.summary,
        model: 'test-model',
      },
    ]);
  });

  it('reports llm-failed when the model returns nothing usable', async () => {
    const artifacts = await createDepthPass().run(contextWith(fakeLlm(null)));
    expect(artifacts[0]).toMatchObject({ kind: 'diagnostics', reason: 'llm-failed' });
  });
});
