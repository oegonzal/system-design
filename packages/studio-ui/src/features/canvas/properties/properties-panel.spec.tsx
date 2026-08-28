import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../../testing/fixtures';
import { renderWithTheme } from '../../../testing/render';
import { createCanvasStore, type CanvasStore } from '../canvas-store';
import { CanvasStoreProvider } from '../canvas-store-context';
import { PropertiesPanel } from './properties-panel';

function renderPanel(seed?: (store: CanvasStore) => void) {
  const store = createCanvasStore(makeGraph());
  seed?.(store);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <PropertiesPanel />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('PropertiesPanel', () => {
  it('shows an empty state when nothing is selected', () => {
    renderPanel();
    expect(screen.getByText(/select a block or connection/i)).toBeTruthy();
  });

  it('edits the selected node label straight into the store', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-2'));

    const label = screen.getByLabelText('Label') as HTMLInputElement;
    expect(label.value).toBe('Order Service');

    await user.type(label, '!');

    expect(store.getState().nodes.find((node) => node.id === 'n-2')?.data.label).toBe(
      'Order Service!',
    );
    expect(store.getState().dirty).toBe(true);
  });

  it('changes the node kind through the kind select', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-2'));

    await user.selectOptions(screen.getByLabelText('Kind'), 'worker');

    expect(store.getState().nodes.find((node) => node.id === 'n-2')?.data.kind).toBe('worker');
  });

  it('writes kind-specific config keys the eval rules read', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-3'));

    const replicas = screen.getByLabelText('Replicas') as HTMLInputElement;
    expect(replicas.value).toBe('1');

    await user.clear(replicas);
    await user.type(replicas, '3');

    expect(
      store.getState().nodes.find((node) => node.id === 'n-3')?.data.config?.['replicas'],
    ).toBe(3);
  });

  it('edits the selected edge: kind toggle and label', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('e-1'));

    await user.selectOptions(screen.getByLabelText('Call style'), 'async');

    expect(store.getState().edges.find((edge) => edge.id === 'e-1')?.data?.kind).toBe('async');
  });

  it('deletes the selected element', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-1'));

    await user.click(screen.getByTestId('delete-selected'));

    expect(store.getState().nodes.map((node) => node.id)).toEqual(['n-2', 'n-3']);
    expect(store.getState().selectedId).toBeNull();
  });
});
