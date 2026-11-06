import {
  BINDING_CLAIM_BOUND,
  CANVAS_MAX_TOTAL_OPERATIONS,
  NODE_OPERATIONS_BOUND,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { SYSTEM_DESIGN_CANVAS } from './definition';
import type { CanvasSubmission } from './output';
import { sampleCriteria, sampleSubmission } from './testing';
import { referencesValidator, structureValidator, tracingValidator } from './validators';

const contract = (): TaskContract<CanvasSubmission> => ({
  ...SYSTEM_DESIGN_CANVAS.task,
  goal: '# Serve an order history',
  criteria: sampleCriteria(),
});

const problems = (artifact: CanvasSubmission) => ({
  references: referencesValidator.validate(artifact, contract()).problems,
  structure: structureValidator.validate(artifact, contract()).problems,
  tracing: tracingValidator.validate(artifact, contract()).problems,
});

const messages = (artifact: CanvasSubmission) => {
  const found = problems(artifact);
  return {
    references: found.references.map((p) => p.message),
    structure: found.structure.map((p) => p.message),
    tracing: found.tracing.map((p) => p.message),
  };
};

describe('the system-design-canvas validators', () => {
  it('[QL-3] [EVAL-7] the sample passes all three; references blocks, structure and tracing warn', () => {
    expect(messages(sampleSubmission())).toEqual({ references: [], structure: [], tracing: [] });
    expect(referencesValidator.gate).toBe('block');
    expect(structureValidator.gate).toBe('warn');
    expect(tracingValidator.gate).toBe('warn');
  });

  it('[EVAL-7] a path that begins past the entry, skips a stage of its way in or stops short of rest is said so, by binding', () => {
    const submission = sampleSubmission();
    const bindings = submission.brief?.bindings ?? [];
    // c1 starts at the gateway; c2 stops at the resolver with nothing else drawn on that walk.
    bindings[0] = { ...bindings[0], path: ['edge-2', 'edge-3'] };
    bindings[1] = { ...bindings[1], path: ['edge-4'] };
    const found = problems(submission).tracing.filter((p) =>
      p.locationRefs[0]?.startsWith('binding.'),
    );
    expect(found.map((p) => [p.severity, p.locationRefs, p.message])).toEqual([
      [
        'low',
        ['binding.1'],
        'path of c1 begins at gateway-1, which is not where a request enters; no way in to check',
      ],
      [
        'medium',
        ['binding.2'],
        'path of c2 enters as a partner system at external-1 and shows no transport security: no certificate manager block on or beside the path and no hop declaring tls',
      ],
      [
        'medium',
        ['binding.2'],
        'path of c2 enters as a partner system at external-1 and shows no edge protection: no waf block on or beside the path',
      ],
      [
        'medium',
        ['binding.2'],
        'path of c2 enters as a partner system at external-1 and shows no the access layer: no api gateway, realtime gateway, load balancer, service mesh block on or beside the path',
      ],
      [
        'medium',
        ['binding.2'],
        'path of c2 enters as a partner system at external-1 and shows no identity: no auth service, authorization service block on or beside the path and no hop declaring auth',
      ],
      [
        'medium',
        ['binding.2'],
        'path of c2 ends at dns-1 (dns), which is not where a request comes to rest',
      ],
    ]);
  });

  it('[EVAL-7] a component no traced path reaches is said so, harder when no binding names it either', () => {
    const submission = sampleSubmission();
    submission.graph.nodes.push(
      { id: 'cache-1', kind: 'cache', label: 'Alert cache' },
      { id: 'cache-2', kind: 'cache', label: 'Claimed cache' },
    );
    submission.graph.edges.push(
      { id: 'edge-17', source: 'notification-service-1', target: 'cache-1', kind: 'sync' },
      { id: 'edge-18', source: 'notification-service-1', target: 'cache-2', kind: 'sync' },
    );
    const bindings = submission.brief?.bindings ?? [];
    bindings[3] = { ...bindings[3], nodeIds: [...bindings[3].nodeIds, 'cache-2'] };
    expect(problems(submission).tracing).toEqual([
      {
        severity: 'medium',
        locationRefs: ['node.16'],
        message: 'node cache-1 is in no binding, on no traced path and beside none',
      },
      {
        severity: 'low',
        locationRefs: ['node.17'],
        message: 'node cache-2 is on no traced path and beside none',
      },
    ]);
  });

  it('[QL-3] a diagram, brief or narrative pointing at what is not there blocks, every problem at once', () => {
    const submission = sampleSubmission();
    submission.graph.edges.push({
      id: 'edge-x',
      source: 'service-1',
      target: 'ghost',
      kind: 'sync',
    });
    submission.brief?.bindings.push({ criterionId: 'c42', nodeIds: ['nobody'], claim: 'held' });
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
      'binding references unknown criterion: c42',
      'binding of c42 references unknown node: nobody',
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
      'edge edge-1 carries listOrders, which neither client-1 nor dns-1 declares',
    ]);
  });

  it('[QL-3] an island and a repeated edge warn, located by position', () => {
    const submission = sampleSubmission();
    submission.graph.nodes.push({ id: 'cache-1', kind: 'cache', label: 'Unused cache' });
    submission.graph.edges.push({
      id: 'edge-17',
      source: 'client-1',
      target: 'dns-1',
      kind: 'sync',
    });
    const found = problems(submission);
    expect(found.references).toEqual([]);
    expect(found.structure).toEqual([
      {
        severity: 'medium',
        locationRefs: ['node.16'],
        message: 'node cache-1 is connected to nothing',
      },
      {
        severity: 'medium',
        locationRefs: ['edge.1', 'edge.17'],
        message: 'edge edge-17 repeats edge edge-1: client-1 -> dns-1 (sync)',
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
    expect(messages(broken)).toEqual({ references: [], structure: [], tracing: [] });
  });

  it('[QL-47] a claim past its ceiling hides nothing: a dangling edge still blocks and an island still warns', () => {
    const submission = sampleSubmission();
    const [first] = submission.brief?.bindings ?? [];
    if (!first) throw new Error('the sample binds a criterion');
    first.claim = 'x'.repeat(BINDING_CLAIM_BOUND.ceiling + 105);
    submission.graph.nodes.push({ id: 'cache-1', kind: 'cache', label: 'Unused cache' });
    submission.graph.edges.push({
      id: 'edge-x',
      source: 'service-1',
      target: 'ghost',
      kind: 'sync',
    });
    // The size alone is no fault a strict read would forgive — the seam kept it, so must these.
    expect(SYSTEM_DESIGN_CANVAS.task.output.schema.safeParse(submission).success).toBe(false);
    expect(messages(submission)).toEqual({
      references: ['edge edge-x references unknown target node: ghost'],
      structure: ['node cache-1 is connected to nothing'],
      tracing: ['node cache-1 is in no binding, on no traced path and beside none'],
    });
  });
});
