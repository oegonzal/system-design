import { describe, expect, it } from 'vitest';

import type { Archetype } from '@sysdesign/contracts';

import { NoopLlmClient, type StructuredRequest } from '@sysdesign/llm';

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

  it('[EVAL-7] the schema is enum-locked to the selection — the model cannot invent scenarios', () => {
    const schema = buildScenarioSchema(selectScenarios('flash-sale-ticketing', 'intro'));
    const invented = schema.safeParse({
      reports: [
        { scenarioId: 'alien-invasion', verdict: 'fails', story: 'aliens', weakestNodeIds: [] },
      ],
    });
    expect(invented.success).toBe(false);
    const legit = schema.safeParse({
      reports: [
        { scenarioId: 'thundering-herd', verdict: 'degrades', story: 'slows', weakestNodeIds: [] },
      ],
    });
    expect(legit.success).toBe(true);
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

  it('narrates reports with clamped node ids, one report per scenario', async () => {
    const canned = {
      reports: [
        {
          scenarioId: 'thundering-herd',
          verdict: 'fails',
          story: 'The database saturates in the first minute.',
          weakestNodeIds: ['n-3', 'ghost-node'],
        },
        {
          scenarioId: 'thundering-herd', // duplicate — first report wins
          verdict: 'survives',
          story: 'second opinion',
          weakestNodeIds: [],
        },
      ],
    };
    const artifacts = await createScenariosPass().run(contextWith(fakeLlm(canned)));
    expect(artifacts).toEqual([
      {
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
      },
    ]);
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
