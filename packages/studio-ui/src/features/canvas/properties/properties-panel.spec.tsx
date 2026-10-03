import {
  DEFAULT_NODE_LABELS,
  OPERATION_NOTES_BOUND,
  NODE_KINDS,
  NODE_KIND_CATEGORIES,
  NODE_KIND_GUIDE,
  kindsInCategory,
  type CanvasGraph,
} from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeGraph, makeInterfaceGraph } from '../../../testing/fixtures';
import { createCanvasStore, type CanvasStore } from '../canvas-store';
import { CanvasStoreProvider } from '../canvas-store-context';
import { CANVAS_COPY } from '../copy';
import { PropertiesPanel } from './properties-panel';

function renderPanel(seed?: (store: CanvasStore) => void, graph: CanvasGraph = makeGraph()) {
  const store = createCanvasStore(graph);
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

  it('[UX-16] while the canvas is read-only the selection can be inspected and nothing in it edited', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => {
      seeded.getState().select('n-3');
      seeded.getState().setReadOnly(true);
    });

    expect(screen.getByTestId('properties-readonly').textContent).toBe(CANVAS_COPY.readOnly);
    const fields = screen.getByTestId('properties-fields') as HTMLFieldSetElement;
    expect(fields.disabled).toBe(true);
    const label = screen.getByLabelText('Label') as HTMLInputElement;
    expect(label.value).toBe('Orders DB');
    expect(label.matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Add operation' }).matches(':disabled')).toBe(true);
    expect(screen.getByTestId('delete-selected').matches(':disabled')).toBe(true);

    await user.click(screen.getByTestId('delete-selected'));
    expect(store.getState().nodes).toHaveLength(3);
  });

  // A blank label is legal on the wire but reads as nothing in the diagram, in
  // the text a lens judges and in a cited location, so the field refuses to be
  // left empty.
  it("restores the kind's own name when the label is cleared and left", async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-3')); // n-3 is a database

    const label = screen.getByLabelText('Label') as HTMLInputElement;
    await user.clear(label);
    expect(store.getState().nodes.find((node) => node.id === 'n-3')?.data.label).toBe('');

    await user.tab();

    expect(store.getState().nodes.find((node) => node.id === 'n-3')?.data.label).toBe(
      DEFAULT_NODE_LABELS.database,
    );
  });

  it('[UX-7] teaches what the selected kind is and when to use it, and swaps when the kind changes', async () => {
    const user = userEvent.setup();
    renderPanel((seeded) => seeded.getState().select('n-3')); // n-3 is a database

    const guide = screen.getByTestId('kind-guide');
    expect(guide.textContent).toContain(NODE_KIND_GUIDE.database.what);
    expect(guide.textContent).toContain(NODE_KIND_GUIDE.database.whenToUse);

    await user.selectOptions(screen.getByRole('combobox', { name: /kind/i }), 'queue');

    expect(screen.getByTestId('kind-guide').textContent).toContain(NODE_KIND_GUIDE.queue.what);
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

  it('[UX-4] groups the kind select into one optgroup per non-empty category', () => {
    renderPanel((seeded) => seeded.getState().select('n-2'));

    const select = screen.getByLabelText('Kind') as HTMLSelectElement;
    const nonEmpty = NODE_KIND_CATEGORIES.filter(
      (category) => kindsInCategory(category.id).length > 0,
    );

    const groups = Array.from(select.querySelectorAll('optgroup'));
    expect(groups.map((group) => group.label)).toEqual(nonEmpty.map((category) => category.label));

    // Options show human labels; values stay the contract slugs the store writes.
    expect(select.options).toHaveLength(NODE_KINDS.length);
    const loadBalancer = select.querySelector('option[value="load-balancer"]');
    expect(loadBalancer?.textContent).toBe('Load Balancer');
    expect(loadBalancer?.closest('optgroup')?.label).toBe('Traffic & Routing');
  });

  it('[UX-9] writes free-form typed config through the store for any kind', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-1')); // a client

    expect(screen.getByTestId('config-section')).toBeTruthy();
    await user.type(screen.getByTestId('config-key'), 'sessions');
    await user.type(screen.getByTestId('config-value'), '120000{Enter}');

    expect(store.getState().nodes.find((node) => node.id === 'n-1')?.data.config).toEqual([
      { key: 'sessions', value: 120_000 },
    ]);
    expect(screen.getByTestId('config-type-sessions').textContent).toContain('number');
  });

  it('shows the database’s stored entries and removes one through the store', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-3'));

    expect(screen.getByTestId('config-row-replicas')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove config replicas' }));

    expect(store.getState().nodes.find((node) => node.id === 'n-3')?.data.config).toEqual([]);
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

/**
 * The interface block applies to every kind: what the author declares is data
 * for the lenses, and no capability table decides who may declare.
 */
describe('PropertiesPanel · interface contracts', () => {
  const renderInterfacePanel = (seed: (store: CanvasStore) => void) =>
    renderPanel(seed, makeInterfaceGraph());

  it('shows a service’s Operations and its responsibility chips', () => {
    renderInterfacePanel((seeded) => seeded.getState().select('n-3'));

    expect(screen.getByRole('heading', { level: 3, name: 'Interface' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Operations' })).toBeTruthy();
    expect(screen.getByText('Owns the order lifecycle')).toBeTruthy();
    expect(screen.getByLabelText('Add responsibility')).toBeTruthy();
  });

  it('renders the same Interface block for a database — nothing is gated by kind', () => {
    renderPanel((seeded) => seeded.getState().select('n-3')); // makeGraph's database
    expect(screen.getByTestId('interface-section')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add operation' })).toBeTruthy();
  });

  it('[UX-5] resolves a call edge’s carries against the callee’s declared operations', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => {
      seeded.getState().updateNode('n-2', {
        operations: [
          { name: 'placeOrder', kind: 'command' },
          { name: 'getOrder', kind: 'query' },
        ],
      });
      seeded.getState().select('e-1'); // client → service
    });

    const checkbox = screen.getByLabelText(
      'placeOrder · command · Order Service',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    await user.click(checkbox);

    expect(store.getState().edges.find((edge) => edge.id === 'e-1')?.data?.carries).toEqual([
      'placeOrder',
    ]);
  });

  it('[UX-5] resolves a consume edge against its source queue’s declared event', () => {
    renderInterfacePanel((seeded) => seeded.getState().select('e-4')); // queue → worker

    const consumed = screen.getByLabelText('OrderPlaced · event · Order Queue') as HTMLInputElement;
    expect(consumed.checked).toBe(true);
  });

  it('always offers the carries field on an edge, saying so when nothing is declared', () => {
    renderPanel((seeded) => seeded.getState().select('e-2')); // service → database

    expect(screen.getByTestId('edge-carries-field')).toBeTruthy();
    expect(screen.getByText(/Neither Order Service nor Orders DB declares/)).toBeTruthy();
  });

  it('shows a carry the endpoints no longer declare as a stale chip', () => {
    renderInterfacePanel((seeded) => {
      seeded.getState().updateEdge('e-1', { carries: ['PlaceOrder', 'mysteryCall'] });
      seeded.getState().select('e-1');
    });

    expect(screen.getByTestId('carry-stale-mysteryCall')).toBeTruthy();
  });

  it('[UX-5] declared operations and responsibilities round-trip through the store', async () => {
    const user = userEvent.setup();
    const store = renderInterfacePanel((seeded) => seeded.getState().select('n-3'));

    await user.type(within(screen.getByTestId('operation-row-0')).getByLabelText('Name'), '!');
    await user.click(screen.getByRole('button', { name: 'Add operation' }));
    await user.type(screen.getByLabelText('Add responsibility'), 'Serves order reads{Enter}');

    const node = store.getState().nodes.find((candidate) => candidate.id === 'n-3');
    expect(node?.data.operations?.[0]?.name).toBe('PlaceOrder!');
    expect(node?.data.operations?.at(-1)).toEqual({ name: '', kind: 'command' });
    expect(node?.data.responsibilities).toEqual([
      'Owns the order lifecycle',
      'Publishes order events',
      'Serves order reads',
    ]);
    expect(store.getState().dirty).toBe(true);
  });

  it('captions every section from the same text for every kind', () => {
    renderInterfacePanel((seeded) => seeded.getState().select('n-4')); // queue
    expect(screen.getByTestId('config-guide').textContent).toContain('lenses read them');
    expect(screen.getByTestId('interface-guide').textContent).toContain('serves or publishes');
    expect(screen.getByTestId('responsibilities-guide').textContent).toContain(
      'what this component owns',
    );
  });

  describe('a field at the panel’s bottom edge', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Every element scrolled into view, in order — `scrollIntoView` is called on the element it reveals. */
    function watchScrolls() {
      const scrolled: Element[] = [];
      vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
        scrolled.push(this);
      });
      return scrolled;
    }

    const describedBy = (control: HTMLElement): HTMLElement[] =>
      (control.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .flatMap((id) => document.getElementById(id) ?? []);

    it('brings the field’s hint into view with it when the field is focused', async () => {
      const user = userEvent.setup();
      renderInterfacePanel((seeded) => seeded.getState().select('n-3'));
      const scrolled = watchScrolls();
      const notes = within(screen.getByTestId('operation-row-0')).getByLabelText('Notes');

      await user.click(notes);

      const [hint] = describedBy(notes);
      expect(hint?.textContent).toMatch(/graders/i);
      await waitFor(() => expect(scrolled).toContain(hint));
      // The control last, so a field taller than the panel keeps what is typed in.
      expect(scrolled.at(-1)).toBe(notes);
    });

    it('brings the countdown into view as it appears while the author types toward the limit', async () => {
      const user = userEvent.setup();
      renderInterfacePanel((seeded) => seeded.getState().select('n-3'));
      const notes = within(screen.getByTestId('operation-row-0')).getByLabelText('Notes');
      await user.click(notes);
      await user.clear(notes);
      const scrolled = watchScrolls();

      await user.paste('x'.repeat(OPERATION_NOTES_BOUND.target - 12));

      const count = await screen.findByText('12 characters left');
      expect(describedBy(notes)).toContain(count);
      await waitFor(() => expect(scrolled).toContain(count));
      expect(scrolled.at(-1)).toBe(notes);
    });
  });
});
