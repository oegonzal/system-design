import { describe, expect, it } from 'vitest';

import { NoopLlmClient, type StructuredRequest } from '@sysdesign/llm';

import type { PassContext } from '../../core/types';
import { buildGraphIndex } from '../../graph-index';
import { fakeLlm, flashSaleFacts, graph, node } from '../../testing';
import { depthSchema } from './depth-schema';
import { createDepthPass } from './depth.pass';

function contextWith(llm: PassContext['llm']): PassContext {
  const canvas = graph([node('n-1', 'client'), node('n-2', 'service')]);
  return {
    graph: canvas,
    facts: flashSaleFacts(),
    index: buildGraphIndex(canvas),
    brief: null,
    narrative: null,
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
    contractQuality: 58,
  },
  summary: 'Mechanisms are named but capacities are defaulted.',
};

/** An enabled client that records the system prompt it was handed. */
function capturingLlm(capture: { system?: string }): PassContext['llm'] {
  return {
    enabled: true,
    model: 'test-model',
    completeStructured: <T>(request: StructuredRequest<T>) => {
      capture.system = request.system;
      return Promise.resolve(null);
    },
  };
}

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
        factors: null,
        summary: CANNED.summary,
        model: 'test-model',
      },
    ]);
  });

  it('reports llm-failed when the model returns nothing usable', async () => {
    const artifacts = await createDepthPass().run(contextWith(fakeLlm(null)));
    expect(artifacts[0]).toMatchObject({ kind: 'diagnostics', reason: 'llm-failed' });
  });

  it('the schema demands the contractQuality subscore', () => {
    expect(depthSchema.safeParse(CANNED).success).toBe(true);
    const withoutContracts = {
      ...CANNED,
      subScores: { ...CANNED.subScores, contractQuality: undefined },
    };
    expect(depthSchema.safeParse(withoutContracts).success).toBe(false);
  });

  it('tells the grader to judge declared contracts themselves', async () => {
    const capture: { system?: string } = {};
    await createDepthPass().run(contextWith(capturingLlm(capture)));
    expect(capture.system).toContain('also grade the contracts themselves');
    expect(capture.system).toContain('idempotency choices');
  });
});
