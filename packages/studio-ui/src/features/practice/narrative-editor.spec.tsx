import { NARRATIVE_MAX_LENGTH } from '@sysdesign/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../testing/fixtures';
import { renderWithTheme } from '../../testing/render';
import { createCanvasStore, type CanvasStore } from '../canvas/canvas-store';
import { CanvasStoreProvider } from '../canvas/canvas-store-context';
import { NarrativeEditor } from './narrative-editor';

function renderEditor(seed?: (store: CanvasStore) => void) {
  const store = createCanvasStore(makeGraph());
  seed?.(store);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <NarrativeEditor />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('NarrativeEditor', () => {
  it('typing writes the narrative into the store and dirties the draft', async () => {
    const user = userEvent.setup();
    const store = renderEditor();

    await user.type(screen.getByLabelText('Design narrative'), 'Hello');

    expect(store.getState().narrative).toBe('Hello');
    expect(store.getState().dirty).toBe(true);
  });

  it('caps the textarea at the contract maximum length', () => {
    renderEditor();
    const area = screen.getByTestId('narrative-editor') as HTMLTextAreaElement;
    expect(area.maxLength).toBe(NARRATIVE_MAX_LENGTH);
  });

  it('lists unmentioned component labels and collapses to an all-covered line', () => {
    const store = renderEditor();

    // Blank draft: every fixture label is still unmentioned.
    const chips = screen.getByTestId('narrative-unmentioned');
    expect(chips.textContent).toContain('Client');
    expect(chips.textContent).toContain('Order Service');
    expect(chips.textContent).toContain('Orders DB');

    // Partial coverage tracks the store's nodes against the text.
    act(() => store.getState().loadNarrative('The client places an order.'));
    const partial = screen.getByTestId('narrative-unmentioned');
    expect(partial.textContent).not.toContain('Client');
    expect(partial.textContent).toContain('Order Service');
    expect(partial.textContent).toContain('Orders DB');

    act(() =>
      store
        .getState()
        .loadNarrative('The Client calls the Order Service, which writes to the Orders DB.'),
    );
    expect(screen.queryByTestId('narrative-unmentioned')).toBeNull();
    expect(screen.getByTestId('narrative-all-covered')).toBeTruthy();
  });

  it('counts words in the draft', () => {
    const store = renderEditor();
    expect(screen.getByTestId('narrative-word-count').textContent).toBe('0 words');

    act(() => store.getState().loadNarrative('one two three'));
    expect(screen.getByTestId('narrative-word-count').textContent).toBe('3 words');
  });
});
