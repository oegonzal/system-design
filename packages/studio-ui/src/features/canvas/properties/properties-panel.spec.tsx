import {
  NODE_KINDS,
  NODE_KIND_CATEGORIES,
  kindsInCategory,
  type CanvasGraph,
} from '@sysdesign/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeGraph, makeInterfaceGraph } from '../../../testing/fixtures';
import { renderWithTheme } from '../../../testing/render';
import { createCanvasStore, type CanvasStore } from '../canvas-store';
import { CanvasStoreProvider } from '../canvas-store-context';
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

  it('changes the node kind through the kind select', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-2'));

    await user.selectOptions(screen.getByLabelText('Kind'), 'worker');

    expect(store.getState().nodes.find((node) => node.id === 'n-2')?.data.kind).toBe('worker');
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

  it('writes kind-specific config keys the eval rules read', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => seeded.getState().select('n-3'));

    const replicas = screen.getByLabelText('Replicas') as HTMLInputElement;
    expect(replicas.value).toBe('1');

    await user.clear(replicas);
    await user.type(replicas, '3');

    expect(
      store.getState().nodes.find((node) => node.id === 'n-3')?.data.config?.['replicas'],
    ).toBe(3);
  });

  it('renders a new-catalog kind’s config form as soon as the kind switches', async () => {
    const user = userEvent.setup();
    renderPanel((seeded) => seeded.getState().select('n-2'));

    await user.selectOptions(screen.getByLabelText('Kind'), 'pub-sub');

    expect(screen.getByLabelText('Delivery')).toBeTruthy();
    expect(screen.getByLabelText('Fan-out (subscribers)')).toBeTruthy();
  });

  it('round-trips a new-catalog knob edit through the store', async () => {
    const user = userEvent.setup();
    const store = renderPanel((seeded) => {
      seeded.getState().updateNode('n-2', { kind: 'pub-sub', label: 'Order Fan-out' });
      seeded.getState().select('n-2');
    });

    await user.selectOptions(screen.getByLabelText('Delivery'), 'exactly-once');
    const fanout = screen.getByLabelText('Fan-out (subscribers)');
    await user.clear(fanout);
    await user.type(fanout, '3');

    const config = store.getState().nodes.find((node) => node.id === 'n-2')?.data.config;
    expect(config?.['delivery']).toBe('exactly-once');
    expect(config?.['fanout']).toBe(3);
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
 * The interface block: driven entirely by the contract's capability table —
 * which kinds declare, what the section is called, whose declarations an
 * edge's carries resolve against.
 */
describe('PropertiesPanel · interface contracts', () => {
  const renderInterfacePanel = (seed: (store: CanvasStore) => void) =>
    renderPanel(seed, makeInterfaceGraph());

  it('shows a service’s Operations limited to command/query, plus its responsibility chips', () => {
    renderInterfacePanel((seeded) => seeded.getState().select('n-3'));

    expect(screen.getByRole('heading', { level: 3, name: 'Interface' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Operations' })).toBeTruthy();

    const kindSelect = within(screen.getByTestId('operation-row-0')).getByRole('combobox', {
      name: 'Kind',
    });
    const kinds = Array.from(kindSelect.querySelectorAll('option')).map((option) => option.value);
    expect(kinds).toEqual(['command', 'query']);

    expect(screen.getByText('Owns the order lifecycle')).toBeTruthy();
    expect(screen.getByLabelText('Add responsibility')).toBeTruthy();
  });

  it('shows a queue’s Message types (command/event) and no responsibilities editor', () => {
    renderInterfacePanel((seeded) => seeded.getState().select('n-4'));

    expect(screen.getByRole('heading', { level: 4, name: 'Message types' })).toBeTruthy();
    expect(screen.queryByTestId('responsibilities-editor')).toBeNull();

    const kindSelect = within(screen.getByTestId('operation-row-0')).getByRole('combobox', {
      name: 'Kind',
    });
    const kinds = Array.from(kindSelect.querySelectorAll('option')).map((option) => option.value);
    expect(kinds).toEqual(['command', 'event']);
  });

  it('renders no Interface block for storage kinds', () => {
    renderPanel((seeded) => seeded.getState().select('n-3')); // makeGraph's database

    expect(screen.queryByTestId('interface-section')).toBeNull();

    // Same node re-shelved as a cache — still storage, still no block.
    renderPanel((seeded) => {
      seeded.getState().updateNode('n-3', { kind: 'cache' });
      seeded.getState().select('n-3');
    });
    expect(screen.queryByTestId('interface-section')).toBeNull();
  });

  it('resolves a call edge’s carries against the callee’s declared operations', async () => {
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

    const checkbox = screen.getByLabelText('placeOrder · command') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    await user.click(checkbox);

    expect(store.getState().edges.find((edge) => edge.id === 'e-1')?.data?.carries).toEqual([
      'placeOrder',
    ]);
  });

  it('resolves produce and consume edges against the queue’s message types', () => {
    renderInterfacePanel((seeded) => seeded.getState().select('e-3')); // service → queue

    const produced = screen.getByLabelText('OrderPlaced · event') as HTMLInputElement;
    expect(produced.checked).toBe(true);
  });

  it('resolves a consume edge against its source queue’s message types', () => {
    renderInterfacePanel((seeded) => seeded.getState().select('e-4')); // queue → worker

    const consumed = screen.getByLabelText('OrderPlaced · event') as HTMLInputElement;
    expect(consumed.checked).toBe(true);
  });

  it('hides the carries field on edges with no interface owner', () => {
    renderPanel((seeded) => seeded.getState().select('e-2')); // service → database

    expect(screen.queryByTestId('edge-carries-field')).toBeNull();
    // The label helper still explains when the prose label shows.
    expect(
      screen.getByText('Shown on the connection when no operations are carried.'),
    ).toBeTruthy();
  });

  it('flags a free-added carry the owner never declared', async () => {
    const user = userEvent.setup();
    const store = renderInterfacePanel((seeded) => seeded.getState().select('e-1')); // client → gateway

    await user.type(screen.getByLabelText('Carry an undeclared operation'), 'mysteryCall{Enter}');

    expect(store.getState().edges.find((edge) => edge.id === 'e-1')?.data?.carries).toEqual([
      'mysteryCall',
    ]);
    expect(screen.getByText('not declared on API Gateway')).toBeTruthy();
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
});
