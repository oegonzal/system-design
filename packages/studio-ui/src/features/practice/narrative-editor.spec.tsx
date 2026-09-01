import { NARRATIVE_MAX_LENGTH } from '@sysdesign/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createCanvasStore } from '../canvas/canvas-store';
import { CanvasStoreProvider } from '../canvas/canvas-store-context';
import { makeGraph } from '../../testing/fixtures';
import { renderWithTheme } from '../../testing/render';
import { NarrativeEditor } from './narrative-editor';

type Seed = (store: ReturnType<typeof createCanvasStore>) => void;

function renderEditor(seed?: Seed) {
  const store = createCanvasStore();
  store.getState().setGraph(makeGraph());
  seed?.(store);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <NarrativeEditor />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('NarrativeEditor', () => {
  it('writes the walkthrough into the store and dirties the draft', async () => {
    const store = renderEditor();
    await userEvent.type(screen.getByTestId('narrative-editor'), 'The Client calls the Service.');

    expect(store.getState().narrative).toBe('The Client calls the Service.');
    expect(store.getState().dirty).toBe(true);
  });

  it('caps the walkthrough at the contract length', () => {
    renderEditor();
    expect(screen.getByTestId('narrative-editor').getAttribute('maxlength')).toBe(
      String(NARRATIVE_MAX_LENGTH),
    );
  });

  it('counts words without grading them', () => {
    renderEditor((store) => store.getState().loadNarrative('one two three'));
    expect(screen.getByTestId('narrative-word-count').textContent).toContain('3 words');
  });

  /**
   * The honesty requirement. Substring probes over this box used to BE the
   * explanation grade; a reader must not be left thinking they still are.
   */
  it('[UX-8] says plainly that the walkthrough is advisory, not scored', () => {
    renderEditor();
    const advisory = screen.getByTestId('narrative-advisory').textContent ?? '';
    expect(advisory).toMatch(/not scored by the engine/i);
    expect(advisory).toMatch(/design brief/i);
  });
});
