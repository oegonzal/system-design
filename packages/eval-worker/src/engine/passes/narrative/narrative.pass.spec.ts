import { describe, expect, it } from 'vitest';

import { NoopLlmClient, type StructuredRequest } from '@sysdesign/llm';

import type { PassContext } from '../../core/types';
import { buildGraphIndex } from '../../graph-index';
import { fakeLlm, flashSaleFacts, graph, node } from '../../testing';
import type { GradedEvidenceArtifact } from '../../core/artifacts';
import { buildNarrativeSchema, type NarrativeCritique } from './narrative-schema';
import { createNarrativePass, NARRATIVE_PASS_ID } from './narrative.pass';

const STORY = 'The client calls the service, which writes every order durably.';

function contextWith(llm: PassContext['llm'], narrative: string | null = STORY): PassContext {
  const canvas = graph([node('n-1', 'client'), node('n-2', 'service')]);
  return {
    graph: canvas,
    facts: flashSaleFacts(),
    index: buildGraphIndex(canvas),
    narrative,
    brief: null,
    narration: null,
    llm,
    priorArtifacts: [],
    options: {},
  };
}

const CANNED: NarrativeCritique = {
  score: 58,
  subScores: {
    componentClarity: 62,
    flowStory: 70,
    requirementCoverage: 40,
    diagramConsistency: 60,
  },
  summary: 'The story explains the parts but never ties them to the latency target.',
  findings: [],
};

const MISALIGNMENT = {
  severity: 'medium' as const,
  weakness: 'medium' as const,
  confidence: 'high' as const,
  requirementId: 'fst-lat-read-spike',
  affectedComponents: ['n-2', 'n-ghost'],
  title: 'The story caches reads the diagram never draws',
  message: '"reads are cached" — no cache node exists; draw one or drop the claim.',
};

/** An enabled client that records the request it was handed. */
function capturingLlm(capture: { system?: string; user?: string }): PassContext['llm'] {
  return {
    enabled: true,
    model: 'test-model',
    completeStructured: <T>(request: StructuredRequest<T>) => {
      capture.system = request.system;
      capture.user = request.user;
      return Promise.resolve(null);
    },
  };
}

describe('narrative pass', () => {
  it('degrades to a diagnostics artifact when the LLM is disabled', async () => {
    const artifacts = await createNarrativePass().run(contextWith(new NoopLlmClient()));
    expect(artifacts).toEqual([
      {
        passId: NARRATIVE_PASS_ID,
        kind: 'diagnostics',
        skipped: true,
        reason: 'llm-disabled',
        detail: null,
      },
    ]);
  });

  it('records not-applicable when no narrative was submitted', async () => {
    for (const absent of [null, '   ']) {
      const artifacts = await createNarrativePass().run(contextWith(fakeLlm(CANNED), absent));
      expect(artifacts).toEqual([
        {
          passId: NARRATIVE_PASS_ID,
          kind: 'diagnostics',
          skipped: true,
          reason: 'not-applicable',
          detail: 'no design narrative was submitted with this revision',
        },
      ]);
    }
  });

  it('emits an axis artifact from a structured critique — no graded evidence when nothing misaligns', async () => {
    const artifacts = await createNarrativePass().run(contextWith(fakeLlm(CANNED)));
    expect(artifacts).toEqual([
      {
        passId: NARRATIVE_PASS_ID,
        kind: 'axis',
        axisId: 'narrative',
        label: 'Narrative & alignment',
        score: 58,
        subScores: CANNED.subScores,
        factors: null,
        summary: CANNED.summary,
        model: 'test-model',
      },
    ]);
  });

  it('[EVAL-16] emits misalignments as graded evidence on the explanation dimension', async () => {
    const artifacts = await createNarrativePass().run(
      contextWith(fakeLlm({ ...CANNED, findings: [MISALIGNMENT] })),
    );
    expect(artifacts).toHaveLength(2);
    const graded = artifacts[1] as GradedEvidenceArtifact;
    expect(graded).toMatchObject({
      passId: NARRATIVE_PASS_ID,
      kind: 'graded-evidence',
      lens: 'critic.narrative',
      // The general critic owns the evaluation summary; this stays silent.
      summary: null,
      model: 'test-model',
    });
    // The lens fixes the dimension — the model never picks one — and the
    // grounding is re-checked (ghost node dropped).
    expect(graded.items[0]).toMatchObject({
      dimension: 'explanation',
      level: 'medium',
      confidence: 'high',
      severity: 'medium',
      requirementId: 'fst-lat-read-spike',
      affectedNodeIds: ['n-2'],
    });
    expect(graded.items[0]?.rationale).toContain('reads are cached');
  });

  it('reports llm-failed when the model returns nothing usable', async () => {
    const artifacts = await createNarrativePass().run(contextWith(fakeLlm(null)));
    expect(artifacts[0]).toMatchObject({ kind: 'diagnostics', reason: 'llm-failed' });
  });

  it('the schema demands every alignment subscore and enum-locks each finding to real ids', () => {
    const ctx = contextWith(fakeLlm(null));
    const schema = buildNarrativeSchema(ctx.graph, ctx.facts);
    expect(schema.safeParse(CANNED).success).toBe(true);
    // Only real node ids are representable at the schema; the pass re-checks anyway.
    const real = { ...MISALIGNMENT, affectedComponents: ['n-2'] };
    expect(schema.safeParse({ ...CANNED, findings: [real] }).success).toBe(true);
    expect(schema.safeParse({ ...CANNED, findings: [MISALIGNMENT] }).success).toBe(false);
    expect(
      schema.safeParse({ ...CANNED, findings: [{ ...real, requirementId: 'not-real' }] }).success,
    ).toBe(false);
    const withoutConsistency = {
      ...CANNED,
      subScores: { ...CANNED.subScores, diagramConsistency: undefined },
    };
    expect(schema.safeParse(withoutConsistency).success).toBe(false);
    expect(schema.safeParse({ ...CANNED, findings: undefined }).success).toBe(false);
  });

  it('grades prose against diagram and prompt, and sends the model both', async () => {
    const capture: { system?: string; user?: string } = {};
    await createNarrativePass().run(contextWith(capturingLlm(capture)));
    // The stable contract: it grades quality for this diagram/prompt, and asks
    // for misalignment findings — not the exact wording.
    expect(capture.system).toContain('THIS diagram');
    expect(capture.system?.toLowerCase()).toContain('quality');
    expect(capture.system?.toLowerCase()).toContain('misalignment');
    expect(capture.user).toContain('# Candidate design (canvas graph)');
    expect(capture.user).toContain(STORY);
    // And the reference frame grounds the critique in the real components.
    expect(capture.user).toContain('# Reference frame');
  });

  it('hands the model the deterministic narrative verdicts as a do-not-repeat section', async () => {
    const capture: { system?: string; user?: string } = {};
    const ctx = contextWith(capturingLlm(capture));
    ctx.priorArtifacts = [
      {
        passId: 'expectations.banks',
        kind: 'coverage',
        entries: [
          {
            expectationId: 'exp.nar.addresses-latency',
            dimension: 'explanation',
            weight: 1,
            met: false,
            nfrId: 'fst-lat-read-spike',
            evidenceNodeIds: [],
            evidenceEdgeIds: [],
          },
          {
            // Diagram coverage stays out of the narrative critic's ledger.
            expectationId: 'exp.core.entry-service',
            dimension: 'hygiene',
            weight: 1,
            met: true,
            nfrId: null,
            evidenceNodeIds: ['n-2'],
            evidenceEdgeIds: [],
          },
        ],
      },
    ];
    await createNarrativePass().run(ctx);
    expect(capture.user).toContain('# Already graded deterministically (do not repeat)');
    expect(capture.user).toContain('[unmet] exp.nar.addresses-latency');
    expect(capture.user).not.toContain('exp.core.entry-service');
  });
});
