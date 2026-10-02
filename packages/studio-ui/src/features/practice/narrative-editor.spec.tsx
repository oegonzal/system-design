import { NARRATION_OVERVIEW_MAX_LENGTH, NARRATION_PROSE_MAX_LENGTH } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeCriteria, makeGraph } from '../../testing/fixtures';
import { createCanvasStore } from '../canvas/canvas-store';
import { CanvasStoreProvider } from '../canvas/canvas-store-context';
import { NarrativeEditor } from './narrative-editor';

type Seed = (store: ReturnType<typeof createCanvasStore>) => void;

function renderEditor(seed?: Seed) {
  const store = createCanvasStore();
  store.getState().setGraph(makeGraph());
  seed?.(store);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <NarrativeEditor criteria={makeCriteria()} />
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

  it('[UX-8] writes a narration keyed to the criterion id', async () => {
    const store = renderEditor();
    await userEvent.type(screen.getByTestId('narrative-narration-c1'), 'The client reads it.');

    expect(store.getState().criterionNarrations).toEqual([
      { criterionId: 'c1', prose: 'The client reads it.' },
    ]);
  });

  it('shows written vs not-written per slot, and lists the components still unexplained', () => {
    renderEditor((store) => {
      store.getState().loadNarrative({
        version: 1,
        overview: 'A split.',
        componentRationales: [{ nodeId: 'n-3', prose: 'short' }],
        criterionNarrations: [],
      });
    });

    const states = screen
      .getAllByTestId('narrative-slot-state')
      .map((chip) => chip.getAttribute('data-state'));
    expect(states).toContain('filled');
    expect(states).toContain('empty');
    // Thin prose is still written — substance is the explanation critic's call.
    expect(states).not.toContain('thin');
    const unexplained = screen.getByTestId('narrative-unexplained').textContent ?? '';
    expect(unexplained).toContain('Client');
    expect(unexplained).not.toContain('Orders DB');
  });

  /**
   * The reference-anchored editor UX-8 describes: a slot per component and
   * per criterion, never one free-text box.
   */
  it('[UX-8] presents the walkthrough as reference-anchored slots for every node and criterion', () => {
    renderEditor();
    expect(screen.getByTestId('narrative-rationale-n-1')).toBeTruthy();
    expect(screen.getByTestId('narrative-rationale-n-3')).toBeTruthy();
    for (const criterion of makeCriteria()) {
      expect(screen.getByTestId(`narrative-narration-${criterion.id}`)).toBeTruthy();
    }
  });

  it('[UX-8] bounds every slot by the schema’s own limit, so nothing written is cut on the way out', () => {
    renderEditor();
    const maxLength = (testId: string) =>
      (screen.getByTestId(testId) as HTMLTextAreaElement).maxLength;
    expect(maxLength('narrative-overview')).toBe(NARRATION_OVERVIEW_MAX_LENGTH);
    expect(maxLength('narrative-rationale-n-3')).toBe(NARRATION_PROSE_MAX_LENGTH);
    expect(maxLength('narrative-narration-c1')).toBe(NARRATION_PROSE_MAX_LENGTH);
  });

  it('[UX-8] says how much of a slot’s limit is left as it nears, and that it was reached — a walkthrough never just stops taking words', () => {
    const store = renderEditor((seeded) => {
      seeded.getState().setNarrativeOverview('Reads and writes are split.');
      seeded.getState().setComponentRationale('n-3', 'x'.repeat(NARRATION_PROSE_MAX_LENGTH - 7));
    });
    // Far from its limit, a slot says nothing; within the last stretch, it counts down.
    expect(screen.getAllByText(/characters? left/).map((count) => count.textContent)).toEqual([
      '7 characters left',
    ]);
    const rationale = screen.getByTestId('narrative-rationale-n-3');
    expect(rationale.getAttribute('aria-describedby')).toContain(`${rationale.id}-limit`);

    act(() => store.getState().setNarrativeOverview('x'.repeat(NARRATION_OVERVIEW_MAX_LENGTH)));
    expect(
      screen.getByText(
        `Limit reached — ${NARRATION_OVERVIEW_MAX_LENGTH.toLocaleString('en-US')} characters at most.`,
      ),
    ).toBeTruthy();
  });
});
