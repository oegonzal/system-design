import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../../testing/canvas-fixtures';
import { createCanvasStore } from '../../canvas/canvas-store';
import { CanvasStoreProvider } from '../../canvas/canvas-store-context';
import { ModelEditor } from './model-editor';

function renderEditor() {
  const store = createCanvasStore(makeGraph());
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <ModelEditor />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('ModelEditor', () => {
  it('[UX-24] adds an entity, names it, owns it by a drawn node, gives it a field and an invariant, and relates it to another', async () => {
    const store = renderEditor();
    await userEvent.click(screen.getByTestId('model-entity-add'));
    await userEvent.type(screen.getByTestId('model-entity-ent-1-name'), 'Order');
    await userEvent.selectOptions(screen.getByTestId('model-entity-ent-1-owner'), 'n-3');
    await userEvent.click(screen.getByTestId('model-entity-ent-1-field-add'));
    await userEvent.type(screen.getByTestId('model-entity-ent-1-field-0-name'), 'placedAt');
    await userEvent.click(screen.getByTestId('model-entity-ent-1-invariant-add'));
    await userEvent.type(screen.getByTestId('model-entity-ent-1-invariant-0'), 'Stored once.');
    expect(store.getState().entities[0]).toEqual({
      id: 'ent-1',
      name: 'Order',
      ownerNodeId: 'n-3',
      fields: [{ name: 'placedAt' }],
      invariants: ['Stored once.'],
      states: [],
    });

    await userEvent.click(screen.getByTestId('model-entity-add'));
    await userEvent.type(screen.getByTestId('model-entity-ent-2-name'), 'Line item');
    await userEvent.click(screen.getByTestId('model-relation-add'));
    await userEvent.selectOptions(screen.getByTestId('model-relation-0-kind'), 'contains');
    expect(store.getState().relations).toEqual([{ from: 'ent-1', to: 'ent-2', kind: 'contains' }]);

    await userEvent.click(screen.getByTestId('model-entity-ent-2-remove'));
    expect(store.getState().entities).toHaveLength(1);
    expect(store.getState().relations).toEqual([]);
  });
});
