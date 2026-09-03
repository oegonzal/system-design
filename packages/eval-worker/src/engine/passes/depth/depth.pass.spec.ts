import { describe, expect, it } from 'vitest';

import { NoopLlmClient, type StructuredRequest } from '@sysdesign/llm';

import type { PassContext } from '../../core/types';
import { buildGraphIndex } from '../../graph-index';
import { fakeLlm, flashSaleFacts, graph, node } from '../../testing';
import type { GradedEvidenceArtifact } from '../../core/artifacts';
import { buildDepthSchema, type DepthCritique } from './depth-schema';
import { createDepthPass } from './depth.pass';

function contextWith(llm: PassContext['llm']): PassContext {
  const canvas = graph([node('n-1', 'client'), node('n-2', 'service')]);
  return {
    graph: canvas,
    facts: flashSaleFacts(),
    index: buildGraphIndex(canvas),
    brief: null,
    narration: null,
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

const CANNED: DepthCritique = {
  depthScore: 61,
  subScores: {
    tradeoffArticulation: 55,
    bottleneckAwareness: 70,
    failureDesign: 50,
    dataFlowClarity: 68,
    contractQuality: 58,
  },
  weaknesses: [],
  summary: 'Mechanisms are named but capacities are defaulted.',
};

const SHALLOW = {
  dimension: 'reliability' as const,
  severity: 'medium' as const,
  weakness: 'medium' as const,
  confidence: 'high' as const,
  requirementId: 'fst-lat-read-spike',
  affectedComponents: ['n-2', 'n-ghost'],
  rationale: 'Failover is a box, not a mechanism: no health check, no promotion story.',
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

  it('emits an axis artifact from a structured critique — no graded evidence when nothing is shallow', async () => {
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

  it('[EVAL-16] emits its shallow spots as graded evidence, grounded and re-checked', async () => {
    const artifacts = await createDepthPass().run(
      contextWith(fakeLlm({ ...CANNED, weaknesses: [SHALLOW] })),
    );
    const graded = artifacts.find((a) => a.kind === 'graded-evidence') as GradedEvidenceArtifact;
    expect(graded.lens).toBe('evaluator.depth');
    expect(graded.items[0]).toMatchObject({
      dimension: 'reliability',
      level: 'medium',
      confidence: 'high',
      requirementId: 'fst-lat-read-spike',
      // The ghost node is dropped; the real one kept.
      affectedNodeIds: ['n-2'],
    });
  });

  it('reports llm-failed when the model returns nothing usable', async () => {
    const artifacts = await createDepthPass().run(contextWith(fakeLlm(null)));
    expect(artifacts[0]).toMatchObject({ kind: 'diagnostics', reason: 'llm-failed' });
  });

  it('the schema demands the contractQuality subscore and enum-locks weakness grounding', () => {
    const ctx = contextWith(fakeLlm(null));
    const schema = buildDepthSchema(ctx.graph, ctx.facts);
    expect(schema.safeParse(CANNED).success).toBe(true);
    const withoutContracts = {
      ...CANNED,
      subScores: { ...CANNED.subScores, contractQuality: undefined },
    };
    expect(schema.safeParse(withoutContracts).success).toBe(false);
    // A requirement the prompt never made is unrepresentable at the schema.
    expect(
      schema.safeParse({ ...CANNED, weaknesses: [{ ...SHALLOW, requirementId: 'not-real' }] })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...CANNED,
        weaknesses: [{ ...SHALLOW, affectedComponents: ['n-2'] }],
      }).success,
    ).toBe(true);
  });

  it('tells the grader to judge declared contracts themselves', async () => {
    const capture: { system?: string } = {};
    await createDepthPass().run(contextWith(capturingLlm(capture)));
    expect(capture.system).toContain('also grade the contracts themselves');
    expect(capture.system).toContain('idempotency choices');
  });
});
