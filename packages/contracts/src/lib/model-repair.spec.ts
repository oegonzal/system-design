import { describe, expect, it } from 'vitest';

import type { CanvasGraph } from './canvas.schema';
import { reconcileModel } from './model-repair';
import { designModelSchema, type ModelEntity } from './model.schema';

const graph: CanvasGraph = {
  nodes: [{ id: 'n-2', kind: 'database', label: 'Orders DB' }],
  edges: [],
};

const entity = (overrides: Partial<ModelEntity>): ModelEntity => ({
  id: 'order',
  name: 'Order',
  fields: [],
  invariants: [],
  states: [],
  ...overrides,
});

describe('reconcileModel', () => {
  it('[UX-24] trims what was written, drops an unnamed entity, a duplicate id, an owner the canvas lacks and a relation to a missing entity, and omits blank slots', () => {
    const model = reconcileModel(
      [
        entity({
          name: '  Order ',
          ownerNodeId: 'n-2',
          key: '  ',
          fields: [{ name: ' placedAt ', note: ' ' }, { name: '' }],
          invariants: [' Stored once. ', ''],
          states: ['placed', ' '],
        }),
        entity({ id: 'order', name: 'Order again' }),
        entity({ id: 'line', name: 'Line item', ownerNodeId: 'ghost' }),
        entity({ id: 'blank', name: '   ' }),
      ],
      [
        { from: 'order', to: 'line', kind: 'contains', note: ' owns its lines ' },
        { from: 'order', to: 'blank', kind: 'references' },
      ],
      graph,
    );
    expect(model).toEqual({
      version: 1,
      entities: [
        {
          id: 'order',
          name: 'Order',
          ownerNodeId: 'n-2',
          fields: [{ name: 'placedAt' }],
          invariants: ['Stored once.'],
          states: ['placed'],
        },
        { id: 'line', name: 'Line item', fields: [], invariants: [], states: [] },
      ],
      relations: [{ from: 'order', to: 'line', kind: 'contains', note: 'owns its lines' }],
    });
    expect(designModelSchema.safeParse(model).success).toBe(true);
  });

  it('[UX-24] is null when no entity is named, so nothing implies the author modelled nothing', () => {
    expect(reconcileModel([entity({ name: ' ' })], [], graph)).toBeNull();
  });
});
