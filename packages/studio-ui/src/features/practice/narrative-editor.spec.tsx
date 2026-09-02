import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createCanvasStore } from '../canvas/canvas-store';
import { CanvasStoreProvider } from '../canvas/canvas-store-context';
import { makeGraph, makePrompt } from '../../testing/fixtures';
import { renderWithTheme } from '../../testing/render';
import { NarrativeEditor } from './narrative-editor';

type Seed = (store: ReturnType<typeof createCanvasStore>) => void;

/** Two real sentences with ample connectives — clears the prose gate. */
const PROSE =
  'The Orders DB persists every order and owns the write path for order state. ' +
  'It is the source of truth that every read is reconciled against.';

function renderEditor(seed?: Seed) {
  const store = createCanvasStore();
  store.getState().setGraph(makeGraph());
  seed?.(store);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <NarrativeEditor prompt={makePrompt()} />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('NarrativeEditor', () => {
  it('writes the overview into the store and dirties the draft', async () => {
    const store = renderEditor();
    await userEvent.type(screen.getByTestId('narrative-overview'), 'Reads and writes are split.');

    expect(store.getState().narrativeOverview).toBe('Reads and writes are split.');
    expect(store.getState().dirty).toBe(true);
  });

  it('writes a component rationale keyed to the node id', async () => {
    const store = renderEditor();
    // makeGraph is n-1 client → n-2 service → n-3 database.
    await userEvent.type(screen.getByTestId('narrative-rationale-n-3'), 'Persists every order.');

    expect(store.getState().componentRationales).toEqual([
      { nodeId: 'n-3', prose: 'Persists every order.' },
    ]);
  });

  it('writes a flow narration keyed to the requirement ordinal', async () => {
    const store = renderEditor();
    await userEvent.type(screen.getByTestId('narrative-flow-0'), 'The client reads availability.');

    expect(store.getState().flowNarrations).toEqual([
      { requirementIndex: 0, prose: 'The client reads availability.' },
    ]);
  });

  it('shows the live verdict the grade will use — thin vs explained', () => {
    renderEditor((store) => {
      store.getState().setComponentRationale('n-3', 'too short');
      store.getState().loadNarrative({
        version: 1,
        overview: PROSE,
        componentRationales: [{ nodeId: 'n-3', prose: 'too short' }],
        flowNarrations: [],
      });
    });

    const overviewState = screen
      .getAllByTestId('narrative-slot-state')
      .map((chip) => chip.getAttribute('data-state'));
    // The overview reads as prose; the n-3 rationale is present but thin.
    expect(overviewState).toContain('explained');
    expect(overviewState).toContain('thin');
  });

  /**
   * The reference-anchored, graded editor UX-8 now describes. An author reading
   * this must understand the walkthrough earns the grade, not that it is ignored.
   */
  it('[UX-8] presents the walkthrough as graded, reference-anchored slots', () => {
    renderEditor();
    // A slot per component and per requirement, not one free-text box.
    expect(screen.getByTestId('narrative-rationale-n-1')).toBeTruthy();
    expect(screen.getByTestId('narrative-rationale-n-3')).toBeTruthy();
    expect(screen.getByTestId('narrative-flow-0')).toBeTruthy();
    expect(screen.queryByTestId('narrative-advisory')).toBeNull();
  });
});
