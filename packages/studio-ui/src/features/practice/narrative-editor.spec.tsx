import { NARRATIVE_MAX_LENGTH } from '@sysdesign/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it } from 'vitest';

import { makeGraph, makePrompt } from '../../testing/fixtures';
import { renderWithTheme } from '../../testing/render';
import { createCanvasStore, type CanvasStore } from '../canvas/canvas-store';
import { CanvasStoreProvider } from '../canvas/canvas-store-context';
import { NarrativeEditor } from './narrative-editor';

function renderEditor(seed?: (store: CanvasStore) => void) {
  const store = createCanvasStore(makeGraph());
  seed?.(store);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <NarrativeEditor prompt={makePrompt()} />
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

  it("[UX-8] tracks the prompt's requirement kinds the draft has not yet addressed", () => {
    const store = renderEditor();

    // Blank draft: every prompt NFR kind is unaddressed (latency,
    // availability, consistency in the fixture prompt).
    const chips = screen.getByTestId('narrative-nfr-unaddressed');
    expect(chips.textContent).toContain('latency');
    expect(chips.textContent).toContain('availability');
    expect(chips.textContent).toContain('consistency');

    act(() => store.getState().loadNarrative('p99 stays low; failover keeps checkout up.'));
    const partial = screen.getByTestId('narrative-nfr-unaddressed');
    expect(partial.textContent).not.toContain('latency');
    expect(partial.textContent).not.toContain('availability');
    expect(partial.textContent).toContain('consistency');

    act(() =>
      store
        .getState()
        .loadNarrative('p99 stays low; failover keeps checkout up; holds are idempotent.'),
    );
    expect(screen.queryByTestId('narrative-nfr-unaddressed')).toBeNull();
    expect(screen.getByTestId('narrative-nfr-covered')).toBeTruthy();
  });

  it('nudges toward a flow story once prose exists but no flow verb does', () => {
    const store = renderEditor();
    // Blank draft: no nag before the author starts writing.
    expect(screen.queryByTestId('narrative-flow-hint')).toBeNull();

    act(() => store.getState().loadNarrative('A gateway, a service, and a database.'));
    expect(screen.getByTestId('narrative-flow-hint')).toBeTruthy();

    act(() => store.getState().loadNarrative('The client calls the service.'));
    expect(screen.queryByTestId('narrative-flow-hint')).toBeNull();
  });
});
