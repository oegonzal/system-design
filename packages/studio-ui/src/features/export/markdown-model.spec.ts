import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../testing/canvas-fixtures';
import { modelMarkdown } from './markdown-model';

// makeGraph: n-1 Client → n-2 Order Service → n-3 Orders DB.
const graph = makeGraph();

describe('modelMarkdown', () => {
  it('[UX-24] prints each entity with its owner resolved to a label and the relations by entity name, dashes where a slot is empty', () => {
    const md = modelMarkdown(
      {
        version: 1,
        entities: [
          {
            id: 'order',
            name: 'Order',
            ownerNodeId: 'n-3',
            key: 'order id',
            fields: [{ name: 'placedAt' }, { name: 'channel', note: 'online or in-store' }],
            invariants: ['Stored once.'],
            states: ['placed', 'fulfilled'],
          },
          { id: 'line', name: 'Line item', fields: [], invariants: [], states: [] },
        ],
        relations: [{ from: 'order', to: 'line', kind: 'contains', note: 'owns its lines' }],
      },
      graph,
    );
    expect(md).toContain(
      '## Order\n\n- Owned by: Orders DB\n- Key: order id\n- Fields: placedAt, channel (online or in-store)\n- Invariants: Stored once.\n- States: placed → fulfilled',
    );
    expect(md).toContain(
      '## Line item\n\n- Owned by: —\n- Key: —\n- Fields: —\n- Invariants: —\n- States: —',
    );
    expect(md).toContain('## Relations\n\n- Order → Line item (contains): owns its lines');
  });

  it('[UX-24] says None for a revision with no model', () => {
    expect(modelMarkdown(null, graph)).toContain('_None._');
    expect(modelMarkdown(undefined, graph)).toContain('_None._');
  });
});
