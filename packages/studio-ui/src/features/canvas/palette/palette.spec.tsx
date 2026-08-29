import { NODE_KINDS, NODE_KIND_CATEGORIES, kindsInCategory } from '@sysdesign/contracts';
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

  it('[UX-4] shows one level-3 heading per non-empty category, in contract order', () => {
    renderPalette();

    const nonEmpty = NODE_KIND_CATEGORIES.filter(
      (category) => kindsInCategory(category.id).length > 0,
    );
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(
      nonEmpty.map((category) => category.label),
    );
  });

  it('[UX-4] filtering narrows to matching kinds and drops emptied categories', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByLabelText('Filter blocks'), 'cache');

    expect(screen.getByTestId('palette-cache')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByTestId('blocks-category-caching')).toBeTruthy();
    expect(screen.queryByTestId('blocks-category-data-stores')).toBeNull();
  });

  it('[UX-4] Escape clears the filter and restores every kind', async () => {
    const user = userEvent.setup();
    renderPalette();

    const filter = screen.getByLabelText('Filter blocks');
    await user.type(filter, 'cache');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    await user.keyboard('{Escape}');

    expect(screen.getAllByRole('listitem')).toHaveLength(NODE_KINDS.length);
  });

  it('[UX-4] a query matching nothing reports it without leaving stray sections', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByLabelText('Filter blocks'), 'zzz-not-a-block');

    expect(screen.getByRole('status').textContent).toContain('No blocks match');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
