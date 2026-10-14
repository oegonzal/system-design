import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../testing/canvas-fixtures';
import { createCanvasStore, type CanvasStore } from './canvas-store';
import { CanvasStoreProvider } from './canvas-store-context';
import { useCanvasShortcuts } from './use-canvas-shortcuts';

function Probe() {
  useCanvasShortcuts();
  return <input aria-label="field" />;
}

function mount(store: CanvasStore) {
  return render(
    <CanvasStoreProvider store={store}>
      <Probe />
    </CanvasStoreProvider>,
  );
}

const label = (store: CanvasStore) => store.getState().nodes[0]?.data.label;

describe('useCanvasShortcuts', () => {
  it('[UX-16] ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redoes', () => {
    const store = createCanvasStore(makeGraph());
    mount(store);
    act(() => store.getState().updateNode('n-1', { label: 'Browser' }));

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(label(store)).toBe('Client');
    fireEvent.keyDown(document.body, { key: 'Z', metaKey: true, shiftKey: true });
    expect(label(store)).toBe('Browser');
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(label(store)).toBe('Client');
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(label(store)).toBe('Browser');
  });

  it('leaves a field’s own undo to the field', () => {
    const store = createCanvasStore(makeGraph());
    const { getByLabelText } = mount(store);
    act(() => store.getState().updateNode('n-1', { label: 'Browser' }));

    fireEvent.keyDown(getByLabelText('field'), { key: 'z', metaKey: true });

    expect(label(store)).toBe('Browser');
  });

  it('Escape dismisses a finding’s highlight', () => {
    const store = createCanvasStore(makeGraph());
    mount(store);
    act(() => store.getState().setHighlight({ nodeIds: ['n-3'], edgeIds: [], severity: 'high' }));

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(store.getState().highlight).toBeNull();
    expect(store.getState().nodes[2]?.data.severity).toBeNull();
  });

  it('stops listening once the canvas unmounts', () => {
    const store = createCanvasStore(makeGraph());
    const { unmount } = mount(store);
    act(() => store.getState().updateNode('n-1', { label: 'Browser' }));
    unmount();

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });

    expect(label(store)).toBe('Browser');
  });
});
