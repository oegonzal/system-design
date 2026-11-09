import type { CanvasChange } from './canvas-change.schema';
import type { DesignSubmission } from './canvas.schema';

/**
 * The best revision the change-set specs apply to, and the change sets they
 * apply: shared by `canvas-change.spec.ts`, `canvas-change.graph.spec.ts`
 * and `canvas-change.resolve.spec.ts`, so the three read one artifact. No
 * vitest import, as the other fixture modules of this package.
 *
 * The render the coach reads numbers every part by position, unfiltered —
 * here `n-1` is `node.1`, `e-2` is `edge.2`, `order` is `entity.1`, and the
 * one decision is `decision.1`.
 */
export function bestSubmission(): DesignSubmission {
  return {
    graph: {
      nodes: [
        { id: 'n-1', kind: 'client', label: 'Shopper', position: { x: 0, y: 0 } },
        {
          id: 'n-2',
          kind: 'service',
          label: 'Order API',
          position: { x: 200, y: 0 },
          operations: [{ name: 'placeOrder', kind: 'command' }],
        },
        {
          id: 'n-3',
          kind: 'database',
          label: 'Orders DB',
          position: { x: 400, y: 0 },
          operations: [{ name: 'write', kind: 'command' }],
        },
      ],
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync', carries: ['placeOrder'] },
        {
          id: 'e-2',
          source: 'n-2',
          target: 'n-3',
          kind: 'sync',
          label: 'writes',
          carries: ['write'],
        },
      ],
    },
    brief: {
      version: 1,
      bindings: [
        {
          criterionId: 'c1',
          nodeIds: ['n-2', 'n-3'],
          path: ['e-1', 'e-2'],
          claim: 'the API writes',
        },
        { criterionId: 'c2', nodeIds: ['n-3'], claim: 'the store keeps it' },
      ],
    },
    narrative: {
      version: 1,
      overview: 'One service in front of one store.',
      componentRationales: [
        { nodeId: 'n-2', prose: 'Holds the order rules.' },
        { nodeId: 'n-3', prose: 'The system of record.' },
      ],
      criterionNarrations: [{ criterionId: 'c1', prose: 'An order goes through the API.' }],
      decisions: [
        {
          choice: 'One store',
          alternative: 'A store per service',
          cost: 'Coupling',
          nodeIds: ['n-3'],
        },
      ],
      assumptions: ['Orders fit one region.'],
    },
    model: {
      version: 1,
      entities: [
        { id: 'order', name: 'Order', ownerNodeId: 'n-3', fields: [], invariants: [], states: [] },
        { id: 'line', name: 'Order line', fields: [], invariants: [], states: [] },
      ],
      relations: [{ from: 'order', to: 'line', kind: 'contains' }],
    },
    transcript: {
      version: 1,
      turns: [{ role: 'interviewer', phase: 'opening', text: 'Walk me through it.' }],
      phases: [{ id: 'opening', startedAt: '2026-11-08T00:00:00.000Z', endedAt: null }],
    },
  };
}

/** A best with no brief, no narrative and no model at all — the containers a change may bring into being. */
export const bareSubmission = (): DesignSubmission => ({
  graph: bestSubmission().graph,
  brief: null,
  narrative: null,
});

export const changeOf = (changes: CanvasChange['changes']): CanvasChange => ({ changes });

/** A change set naming every part once, as the coach might return it. */
export function wholeChange(): CanvasChange {
  return changeOf({
    nodes: { upsert: [{ id: 'ai-cache', kind: 'cache', label: 'Order cache' }], remove: ['n-1'] },
    edges: {
      upsert: [{ id: 'ai-e-1', source: 'n-2', target: 'ai-cache', kind: 'sync' }],
      remove: ['e-1'],
    },
    entities: {
      upsert: [
        { id: 'cart', name: 'Cart', fields: [{ name: 'items' }], invariants: [], states: [] },
      ],
      remove: ['line'],
    },
    relations: { replace: [{ from: 'cart', to: 'order', kind: 'references' }] },
    bindings: {
      upsert: [{ criterionId: 'c2', nodeIds: ['ai-cache'], claim: 'cached' }],
      remove: [],
    },
    rationales: { upsert: [{ nodeId: 'ai-cache', prose: 'Absorbs the reads.' }], remove: ['n-2'] },
    narrations: { upsert: [{ criterionId: 'c2', prose: 'Reads hit the cache.' }], remove: ['c1'] },
    decisions: {
      upsertAt: [{ at: 1, decision: { choice: 'One store, cached', cost: 'Staleness' } }],
      removeAt: [],
      append: [{ choice: 'Cache the reads', cost: 'Staleness' }],
    },
    assumptions: {
      upsertAt: [{ at: 1, text: 'Orders fit one region, reads outnumber writes.' }],
      removeAt: [],
      append: ['Reads outnumber writes.'],
    },
    overview: 'A cache in front of the store.',
  });
}

export const idsOf = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);
