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

  it('[QL-3] an ill-formed artifact is left to the schema validator', () => {
    const broken = { graph: { nodes: 'no' } } as unknown as CanvasSubmission;
    expect(messages(broken)).toEqual({ references: [], structure: [] });
  });
});
