import { PROMPT_COPY } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeGraph } from '../../../testing/fixtures';
import { createCanvasStore, type CanvasStore } from '../canvas-store';
import { CanvasStoreProvider } from '../canvas-store-context';
import { CanvasToolbar, type CanvasToolbarProps } from './canvas-toolbar';

function renderToolbar(store: CanvasStore, props: Partial<CanvasToolbarProps> = {}) {
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <CanvasToolbar
        onSubmit={vi.fn()}
        submitting={false}
        revisionStatus={null}
        revisionNumber={null}
        onExport={vi.fn()}
        exporting={false}
        {...props}
      />
    </CanvasStoreProvider>,
  );
}

const button = (testId: string) => screen.getByTestId(testId) as HTMLButtonElement;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CanvasToolbar', () => {
  it('[UX-2] Undo and Redo follow the history and walk it', async () => {
    const user = userEvent.setup();
    const store = createCanvasStore(makeGraph());
    renderToolbar(store);
    expect(button('canvas-undo').disabled).toBe(true);
    expect(button('canvas-redo').disabled).toBe(true);
    expect(button('canvas-undo').getAttribute('aria-keyshortcuts')).toContain('Meta+Z');

    act(() => store.getState().updateNode('n-1', { label: 'Browser' }));
    expect(button('canvas-undo').disabled).toBe(false);

    await user.click(button('canvas-undo'));
    expect(store.getState().nodes[0]?.data.label).toBe('Client');
    expect(button('canvas-redo').disabled).toBe(false);

    await user.click(button('canvas-redo'));
    expect(store.getState().nodes[0]?.data.label).toBe('Browser');
  });

  it('[UX-2] Clear asks first and is one undo away from the diagram', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const store = createCanvasStore(makeGraph());
    renderToolbar(store);

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(store.getState().nodes).toHaveLength(0);
    expect(store.getState().dirty).toBe(true);

    await user.click(button('canvas-undo'));
    expect(store.getState().nodes).toHaveLength(3);
  });

  it('Fit view asks the canvas for the same fit a load gets', async () => {
    const user = userEvent.setup();
    const store = createCanvasStore(makeGraph());
    renderToolbar(store);
    const before = store.getState().fitRequest;

    await user.click(button('canvas-fit'));

    expect(store.getState().fitRequest).toBe(before + 1);
  });

  it('[UX-2] a read-only canvas leaves nothing to submit, clear or undo', () => {
    const store = createCanvasStore(makeGraph());
    store.getState().updateNode('n-1', { label: 'Browser' });
    store.getState().setReadOnly(true);
    renderToolbar(store);

    expect(button('submit-revision').disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(button('canvas-undo').disabled).toBe(true);
    // Looking is still allowed.
    expect(button('canvas-fit').disabled).toBe(false);
    expect(button('export-run').disabled).toBe(false);
  });

  it('[UX-14] says why Submit is off: the run holding the session first, then an archived prompt', () => {
    const store = createCanvasStore(makeGraph());
    renderToolbar(store, { promptArchived: true, submitBlockedReason: 'Revision #2 is grading.' });

    expect(button('submit-revision').disabled).toBe(true);
    expect(button('submit-revision').title).toBe('Revision #2 is grading.');
  });

  it('[UX-14] an archived prompt explains itself in the studio’s own words', () => {
    const store = createCanvasStore(makeGraph());
    renderToolbar(store, { promptArchived: true });

    expect(button('submit-revision').disabled).toBe(true);
    expect(button('submit-revision').title).toBe(PROMPT_COPY.archived);
  });
});
