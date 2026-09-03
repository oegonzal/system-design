import { describe, expect, it } from 'vitest';

import type { Archetype } from '@sysdesign/contracts';

import { NoopLlmClient, type StructuredRequest } from '@sysdesign/llm';

import type { GradedEvidenceArtifact } from '../../core/artifacts';
import type { PassContext } from '../../core/types';
import { buildGraphIndex } from '../../graph-index';
import { fakeLlm, flashSaleFacts, graph, node } from '../../testing';
import { buildScenarioSchema } from './scenario-schema';
import { selectScenarios } from './scenario-table';
import { createScenariosPass, SCENARIOS_PASS_ID } from './scenarios.pass';

function contextWith(llm: PassContext['llm'], facts = flashSaleFacts()): PassContext {
  const canvas = graph([node('n-1', 'client'), node('n-2', 'service'), node('n-3', 'database')]);
  return {
    graph: canvas,
    facts,
    index: buildGraphIndex(canvas),
    brief: null,
    narration: null,
    narrative: null,
    llm,
    priorArtifacts: [],
    options: {},
  };
}

describe('scenario selection', () => {
  it('[EVAL-7] is deterministic and cumulative across difficulty tiers', () => {
    expect(selectScenarios('flash-sale-ticketing', 'intro').map((s) => s.id)).toEqual([
      'thundering-herd',
    ]);
    expect(selectScenarios('flash-sale-ticketing', 'standard').map((s) => s.id)).toEqual([
      'thundering-herd',
      'hot-partition',
    ]);
    expect(selectScenarios('flash-sale-ticketing', 'advanced').map((s) => s.id)).toEqual([
      'thundering-herd',
      'hot-partition',
      'region-loss',
    ]);
    expect(selectScenarios('dag-orchestration', 'advanced').map((s) => s.id)).toEqual([
      'worker-crash',
      'scheduler-crash',
      'split-brain',
    ]);
  });

  it('degrades a stale persisted archetype to the universal scenario instead of throwing', () => {
    const stale = 'retired-archetype' as unknown as Archetype;
    expect(selectScenarios(stale, 'standard').map((s) => s.id)).toEqual(['region-loss']);
  });

  it('[EVAL-7] the schema is enum-locked to the selection, the NFRs and the nodes', () => {
    const ctx = contextWith(fakeLlm(null));
    const schema = buildScenarioSchema(
      selectScenarios('flash-sale-ticketing', 'intro'),
      ctx.graph,
      ctx.facts,
    );
    const base = {
      verdict: 'degrades',
      story: 'slows',
      weakestNodeIds: [],
      violatesRequirementId: null,
      confidence: 'medium',
    };
    // The model cannot invent a scenario…
    expect(schema.safeParse({ reports: [{ ...base, scenarioId: 'alien-invasion' }] }).success).toBe(
      false,
    );
    // …nor a requirement or a node.
    expect(
      schema.safeParse({
        reports: [{ ...base, scenarioId: 'thundering-herd', violatesRequirementId: 'not-real' }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        reports: [{ ...base, scenarioId: 'thundering-herd', weakestNodeIds: ['ghost-node'] }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        reports: [
          {
            ...base,
            scenarioId: 'thundering-herd',
            violatesRequirementId: 'fst-lat-read-spike',
            weakestNodeIds: ['n-3'],
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('scenarios pass', () => {
  it('degrades to diagnostics when the LLM is disabled', async () => {
    const artifacts = await createScenariosPass().run(contextWith(new NoopLlmClient()));
    expect(artifacts[0]).toMatchObject({
      passId: SCENARIOS_PASS_ID,
      kind: 'diagnostics',
      reason: 'llm-disabled',
    });
  });

  it('narrates reports with clamped node ids, one report per scenario — and grades the failure', async () => {
    const canned = {
      reports: [
        {
          scenarioId: 'thundering-herd',
          verdict: 'fails',
          story: 'The database saturates in the first minute.',
          weakestNodeIds: ['n-3', 'ghost-node'],
          violatesRequirementId: 'fst-lat-read-spike',
          confidence: 'high',
        },
        {
          scenarioId: 'thundering-herd', // duplicate — first report wins
          verdict: 'survives',
          story: 'second opinion',
          weakestNodeIds: [],
          violatesRequirementId: null,
          confidence: 'low',
        },
      ],
    };
    const artifacts = await createScenariosPass().run(contextWith(fakeLlm(canned)));
    expect(artifacts[0]).toEqual({
      passId: SCENARIOS_PASS_ID,
      kind: 'scenarios',
      reports: [
        {
          scenarioId: 'thundering-herd',
          title: 'The on-sale thundering herd',
          verdict: 'fails',
          story: 'The database saturates in the first minute.',
          weakestNodeIds: ['n-3'],
        },
      ],
      model: 'test-model',
    });
    // [EVAL-16] The failure is graded evidence: the engine maps the verdict to
    // the magnitude (fails → high), grounded to the NFR it breaks.
    const graded = artifacts[1] as GradedEvidenceArtifact;
    expect(graded.lens).toBe('evaluator.scenarios');
    expect(graded.items).toHaveLength(1);
    expect(graded.items[0]).toMatchObject({
      dimension: 'reliability',
      level: 'high',
      confidence: 'high',
      severity: 'high',
      requirementId: 'fst-lat-read-spike',
      affectedNodeIds: ['n-3'],
    });
  });

  it('a surviving verdict is no weakness — no graded evidence is emitted', async () => {
    const canned = {
      reports: [
        {
          scenarioId: 'thundering-herd',
          verdict: 'survives',
          story: 'The cache absorbs it.',
          weakestNodeIds: [],
          violatesRequirementId: null,
          confidence: 'high',
        },
      ],
    };
    const artifacts = await createScenariosPass().run(contextWith(fakeLlm(canned)));
    expect(artifacts.map((a) => a.kind)).toEqual(['scenarios']);
  });

  it('reports llm-failed when the model returns nothing usable', async () => {
    const artifacts = await createScenariosPass().run(contextWith(fakeLlm(null)));
    expect(artifacts[0]).toMatchObject({ kind: 'diagnostics', reason: 'llm-failed' });
  });

  it('tells the reviewer to honor declared operations and carries as contracts', async () => {
    const capture: { system?: string } = {};
    const llm: PassContext['llm'] = {
      enabled: true,
      model: 'test-model',
      completeStructured: <T>(request: StructuredRequest<T>) => {
        capture.system = request.system;
        return Promise.resolve<T | null>(null);
      },
    };
    await createScenariosPass().run(contextWith(llm));
    expect(capture.system).toContain("operations and carries as the design's contracts");
    expect(capture.system).toContain('declared idempotent converges');
  });
});
