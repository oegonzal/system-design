import { CANVAS_MAX_TOTAL_OPERATIONS, NODE_OPERATIONS_BOUND } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { SYSTEM_DESIGN_CANVAS } from './definition';
import type { CanvasSubmission } from './output';
import { sampleCriteria, sampleSubmission } from './testing';
import { referencesValidator, structureValidator } from './validators';

const contract = (): TaskContract<CanvasSubmission> => ({
  ...SYSTEM_DESIGN_CANVAS.task,
  goal: '# Serve an order history',
  criteria: sampleCriteria(),
});

const problems = (artifact: CanvasSubmission) => ({
  references: referencesValidator.validate(artifact, contract()).problems,
  structure: structureValidator.validate(artifact, contract()).problems,
});

const messages = (artifact: CanvasSubmission) => {
  const found = problems(artifact);
  return {
    references: found.references.map((p) => p.message),
    structure: found.structure.map((p) => p.message),
  };
};

describe('the system-design-canvas validators', () => {
  it('[QL-3] the sample passes both; references block and structure warns', () => {
    expect(messages(sampleSubmission())).toEqual({ references: [], structure: [] });
    expect(referencesValidator.gate).toBe('block');
    expect(structureValidator.gate).toBe('warn');
  });

  it('[QL-3] a diagram, brief or narrative pointing at what is not there blocks, every problem at once', () => {
    const submission = sampleSubmission();
    submission.graph.edges.push({
      id: 'edge-x',
      source: 'service-1',
      target: 'ghost',
      kind: 'sync',
    });
    submission.brief?.bindings.push({ criterionId: 'c9', nodeIds: ['nobody'], claim: 'held' });
    submission.brief?.bindings.push({
      criterionId: 'c4',
      nodeIds: ['service-1'],
      path: ['edge-1', 'edge-3'],
      claim: 'bound twice, and the path skips a hop',
    });
    submission.narrative?.componentRationales.push({
      nodeId: 'ghost',
      prose: 'a box that is not drawn',
    });
    const found = problems(submission);
    expect(found.references.every((p) => p.severity === 'critical')).toBe(true);
    expect(found.references.map((p) => p.message)).toEqual([
      'edge edge-x references unknown target node: ghost',
      'binding references unknown criterion: c9',
      'binding of c9 references unknown node: nobody',
      'criterion c4 is bound twice',
      'path of c4 breaks at edge edge-3 — it does not continue the walk',
      'narrative explains unknown node: ghost',
    ]);
    expect(found.structure).toEqual([]);
  });

  it('[QL-3] a carry neither endpoint declares blocks — the rule the studio refuses with', () => {
    const submission = sampleSubmission();
    submission.graph.edges[0] = { ...submission.graph.edges[0], carries: ['listOrders'] };
    expect(messages(submission).references).toEqual([
      'edge edge-1 carries listOrders, which neither client-1 nor gateway-1 declares',
    ]);
  });

  it('[QL-3] an island and a repeated edge warn, located by position', () => {
    const submission = sampleSubmission();
    submission.graph.nodes.push({ id: 'cache-1', kind: 'cache', label: 'Unused cache' });
    submission.graph.edges.push({
      id: 'edge-14',
      source: 'client-1',
      target: 'gateway-1',
      kind: 'sync',
    });
    const found = problems(submission);
    expect(found.references).toEqual([]);
    expect(found.structure).toEqual([
      {
        severity: 'medium',
        locationRefs: ['node.14'],
        message: 'node cache-1 is connected to nothing',
      },
      {
        severity: 'medium',
        locationRefs: ['edge.1', 'edge.14'],
        message: 'edge edge-14 repeats edge edge-1: client-1 -> gateway-1 (sync)',
      },
    ]);
  });

  // The three rules the coach is now told about in the schema: each voids a
  // whole revision, and none is expressible as a bound, so each is checked here
  // as well as in the contracts spec that owns the function.
  it('[QL-3] a repeated config key or operation name on one node blocks', () => {
    const submission = sampleSubmission();
    const node = submission.graph.nodes.find((candidate) => candidate.id === 'client-1');
    if (!node) throw new Error('the sample canvas no longer has client-1');
    node.config = [
      { key: 'replicas', value: 2 },
      { key: 'replicas', value: 3 },
    ];
    node.operations = [{ name: 'readHistory' }, { name: 'readHistory' }];
    expect(messages(submission).references).toEqual([
      `node ${node.id} sets config key replicas twice`,
      `node ${node.id} declares duplicate operation name: readHistory`,
    ]);
  });

  it('[QL-3] the whole-graph operation budget blocks a canvas the schema would accept', () => {
    const submission = sampleSubmission();
    const nodeCount = Math.ceil((CANVAS_MAX_TOTAL_OPERATIONS + 1) / NODE_OPERATIONS_BOUND.target);
    submission.graph.nodes = Array.from({ length: nodeCount }, (_, n) => ({
      id: `n-${n}`,
      kind: 'service' as const,
      label: `Service ${n}`,
      operations: Array.from({ length: NODE_OPERATIONS_BOUND.target }, (_, i) => ({
        name: `op-${n}-${i}`,
      })),
    }));
    submission.graph.edges = [];
    submission.brief = null;
    submission.narrative = null;
    expect(SYSTEM_DESIGN_CANVAS.task.output.schema.safeParse(submission).success).toBe(true);
    expect(messages(submission).references).toContain(
      `graph declares ${nodeCount * NODE_OPERATIONS_BOUND.target} operations — the maximum is ${CANVAS_MAX_TOTAL_OPERATIONS}`,
    );
  });

  it('[QL-3] an ill-formed artifact is left to the schema validator', () => {
    const broken = { graph: { nodes: 'no' } } as unknown as CanvasSubmission;
    expect(messages(broken)).toEqual({ references: [], structure: [] });
  });
});
