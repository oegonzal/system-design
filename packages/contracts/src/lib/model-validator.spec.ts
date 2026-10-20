import { describe, expect, it } from 'vitest';

import type { CanvasGraph } from './canvas.schema';
import { validateModelReferences } from './model-validator';
import type { DesignModel } from './model.schema';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'service', label: 'Orders' },
    { id: 'n-2', kind: 'database', label: 'Orders DB' },
  ],
  edges: [],
};

const model = (overrides: Partial<DesignModel>): DesignModel => ({
  version: 1,
  entities: [
    { id: 'order', name: 'Order', ownerNodeId: 'n-2', fields: [], invariants: [], states: [] },
    { id: 'line', name: 'Line item', fields: [], invariants: [], states: [] },
  ],
  relations: [{ from: 'order', to: 'line', kind: 'contains' }],
  ...overrides,
});

describe('validateModelReferences', () => {
  it('[UX-24] accepts entities owned by drawn nodes and relations between declared entities, however thin', () => {
    expect(validateModelReferences(graph, model({}))).toEqual([]);
  });

  it('[UX-24] rejects a duplicate entity id, an owner that is not drawn and a relation to an entity that is not declared', () => {
    expect(
      validateModelReferences(
        graph,
        model({
          entities: [
            {
              id: 'order',
              name: 'Order',
              ownerNodeId: 'ghost',
              fields: [],
              invariants: [],
              states: [],
            },
            { id: 'order', name: 'Order again', fields: [], invariants: [], states: [] },
          ],
          relations: [{ from: 'order', to: 'nowhere', kind: 'references' }],
        }),
      ),
    ).toEqual([
      'entity order is owned by unknown node: ghost',
      'model declares entity order twice',
      'relation 1 references unknown entity: nowhere',
    ]);
  });
});
