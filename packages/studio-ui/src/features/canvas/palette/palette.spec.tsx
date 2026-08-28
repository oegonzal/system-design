import { NODE_KINDS } from '@sysdesign/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../../testing/render';
import { createCanvasStore } from '../canvas-store';
import { CanvasStoreProvider } from '../canvas-store-context';
import { Palette } from './palette';

function renderPalette() {
  const store = createCanvasStore();
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <Palette />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('Palette', () => {
  it('[UX-1] renders one draggable entry for every contract node kind', () => {
    renderPalette();

    for (const kind of NODE_KINDS) {
      const entry = screen.getByTestId(`palette-${kind}`);
      expect(entry.getAttribute('draggable')).toBe('true');
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(NODE_KINDS.length);
  });

  it('[UX-1] click-to-add creates a node of that kind in the store', async () => {
    const user = userEvent.setup();
    const store = renderPalette();

    await user.click(screen.getByTestId('palette-queue'));

    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().nodes[0].data.kind).toBe('queue');
    expect(store.getState().nodes[0].data.label).toBe('Queue');
  });

  it('[UX-1] consecutive keyboard adds never stack on the same position', async () => {
    const user = userEvent.setup();
    const store = renderPalette();

    await user.click(screen.getByTestId('palette-service'));
    await user.click(screen.getByTestId('palette-database'));

    const [first, second] = store.getState().nodes;
    expect(first.position).not.toEqual(second.position);
  });
});
