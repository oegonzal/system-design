import type { CanvasGraph, DesignBrief, DesignNarrative } from '@sysdesign/contracts';
import type { LlmClient, StructuredRequest } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import type { EngineFinding, PromptFacts } from '../../../engine/types';
import { orderFindings, proposeImprovement } from './llm-proposer';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Client' },
    { id: 'n-2', kind: 'service', label: 'Service' },
    { id: 'n-3', kind: 'database', label: 'Database' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2' },
    { id: 'e-2', source: 'n-2', target: 'n-3' },
  ],
};

const facts: PromptFacts = {
  archetype: 'flash-sale-ticketing',
  difficulty: 'standard',
  scaleTargets: {
    concurrentUsers: 10000,
    requestsPerSecond: 4000,
    readWriteRatio: '80:20',
    p99LatencyMs: 300,
    availabilityPct: '99.95',
  },
  nfrKinds: ['latency'],
  nfrs: [{ id: 'nfr-1', kind: 'latency', statement: 'fast reads', target: null, targetSpec: null }],
  functionalCapabilities: [],
  functionalRequirementCount: 2,
  functionalText: 'sell tickets prevent overselling',
  workflow: null,
};

/** A client whose one structured answer is scripted by the test. */
const scripted = (answer: unknown | null): LlmClient => ({
  enabled: true,
  model: 'scripted',
  completeStructured: <T>(_request: StructuredRequest<T>): Promise<T | null> =>
    Promise.resolve(answer as T | null),
});

const baseInput = { graph, brief: null, narrative: null, facts, findings: [], overallScore: 40 };

describe('proposeImprovement', () => {
  it('returns null without a live client, and on a refused/schema-missed call', async () => {
    const disabled: LlmClient = {
      enabled: false,
      model: null,
      completeStructured: () => Promise.resolve(null),
    };
    expect(await proposeImprovement(disabled, baseInput)).toBeNull();
    expect(await proposeImprovement(scripted(null), baseInput)).toBeNull();
  });

  it('assembles the candidate: add-node lands before the add-edge that needs it, config folds', async () => {
    const candidate = await proposeImprovement(
      scripted({
        description: 'Add a read replica so reads survive primary maintenance.',
        graphOps: [
          // Deliberately edge-first: assembly must reorder or the edge is
          // silently dropped by the patch applier's unknown-node guard.
          { op: 'add-edge', edge: { id: 'ai-read', source: 'n-3', target: 'ai-replica' } },
          {
            op: 'add-node',
            node: {
              id: 'ai-replica',
              kind: 'replica',
              label: 'Read Replica',
              configEntries: [{ key: 'replicas', value: 2 }],
            },
          },
          {
            op: 'update-node',
            nodeId: 'n-2',
            set: { configEntries: [{ key: 'replicas', value: 3 }] },
          },
        ],
        brief: {
          nfrBindings: [{ nfrId: 'nfr-1', nodeIds: ['ai-replica'], mechanism: 'read-replica' }],
          flows: [{ id: 'ai-flow-read', requirementIndex: 0, path: ['e-1', 'e-2'] }],
        },
        narrative: {
          overview: 'Reads scale out through a replica. The primary keeps writes.',
          componentRationales: [
            { nodeId: 'ai-replica', prose: 'It serves reads. It shields the primary.' },
          ],
          flowNarrations: [
            { requirementIndex: 0, prose: 'The client reads. The replica answers.' },
          ],
        },
      }),
      baseInput,
    );

    expect(candidate).not.toBeNull();
    const replica = candidate?.graph.nodes.find((node) => node.id === 'ai-replica');
    expect(replica?.config).toEqual({ replicas: 2 });
    // The edge survived because its node was added first.
    expect(candidate?.graph.edges.some((edge) => edge.id === 'ai-read')).toBe(true);
    expect(candidate?.graph.nodes.find((node) => node.id === 'n-2')?.config).toEqual({
      replicas: 3,
    });
    expect(candidate?.brief?.nfrBindings).toHaveLength(1);
    expect(candidate?.narrative?.overview).toContain('replica');
  });

  it('prunes only unresolvable references after a removal, keeping the rest for the engine to judge', async () => {
    const narrative: DesignNarrative = {
      version: 1,
      componentRationales: [
        { nodeId: 'n-2', prose: 'It routes. It owns nothing else.' },
        { nodeId: 'n-3', prose: 'It stores. It is the truth.' },
      ],
      flowNarrations: [],
    };
    const brief: DesignBrief = {
      version: 1,
      nfrBindings: [{ nfrId: 'nfr-1', nodeIds: ['n-3', 'n-2'], mechanism: 'backups' }],
      flows: [{ id: 'f-1', requirementIndex: 0, path: ['e-1', 'e-2'] }],
    };

    const candidate = await proposeImprovement(
      scripted({
        description: 'Remove the database in favor of nothing (a bad idea the gate will reject).',
        graphOps: [{ op: 'remove-node', nodeId: 'n-3' }],
      }),
      { ...baseInput, brief, narrative },
    );

    expect(candidate?.graph.nodes.map((node) => node.id)).toEqual(['n-1', 'n-2']);
    // n-3's rationale is gone; n-2's stays.
    expect(candidate?.narrative?.componentRationales.map((r) => r.nodeId)).toEqual(['n-2']);
    // The binding drops the missing node but keeps the resolvable one; the
    // flow lost e-2 with the node, so the whole walk goes.
    expect(candidate?.brief?.nfrBindings[0]?.nodeIds).toEqual(['n-2']);
    expect(candidate?.brief?.flows).toEqual([]);
  });
});

describe('orderFindings', () => {
  it('orders by severity rank, then dimension, then title — deterministically', () => {
    const finding = (severity: string, dimension: string, title: string): EngineFinding =>
      ({
        ruleId: null,
        expectationId: null,
        nfrId: null,
        dimension,
        severity,
        title,
        message: 'm',
        affectedNodeIds: [],
        affectedEdgeIds: [],
        suggestion: null,
        countsAsViolation: true,
      }) as unknown as EngineFinding;

    const ordered = orderFindings([
      finding('info', 'data', 'z'),
      finding('critical', 'reliability', 'b'),
      finding('critical', 'data', 'a'),
      finding('high', 'security', 'c'),
    ]);
    expect(ordered.map((entry) => entry.title)).toEqual(['a', 'b', 'c', 'z']);
  });
});
