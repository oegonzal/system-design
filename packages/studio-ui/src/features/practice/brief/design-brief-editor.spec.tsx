import { BINDING_CLAIM_BOUND, type CanvasGraph } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeCriteria } from '../../../testing/fixtures';
import { createCanvasStore } from '../../canvas/canvas-store';
import { CanvasStoreProvider } from '../../canvas/canvas-store-context';
import { DesignBriefEditor } from './design-brief-editor';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Buyer' },
    { id: 'n-2', kind: 'gateway', label: 'Gateway' },
    { id: 'n-3', kind: 'service', label: 'Checkout' },
    { id: 'n-4', kind: 'database', label: 'Orders' },
    { id: 'n-5', kind: 'database', label: 'Archive' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
    { id: 'e-3', source: 'n-3', target: 'n-4', kind: 'sync' },
  ],
};

const criteria = makeCriteria();

function renderEditor(seed?: (store: ReturnType<typeof createCanvasStore>) => void) {
  const store = createCanvasStore(graph);
  seed?.(store);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <DesignBriefEditor criteria={criteria} />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('DesignBriefEditor', () => {
  it('[UX-6] renders one row per criterion, grouped by kind, every one unbound', () => {
    renderEditor();
    for (const criterion of criteria) {
      expect(screen.getByTestId(`binding-row-${criterion.id}`)).toBeTruthy();
      expect(screen.getByTestId(`binding-state-${criterion.id}`).getAttribute('data-state')).toBe(
        'empty',
      );
    }
    expect(screen.getByRole('heading', { level: 3, name: 'Functional' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Constraint' })).toBeTruthy();
  });

  it('[UX-23] records why this mechanism and not another beside the claim', async () => {
    const store = renderEditor();
    await userEvent.type(screen.getByTestId('binding-tradeoff-c3'), 'a replica, not a cache');
    expect(store.getState().bindings).toEqual([
      { criterionId: 'c3', nodeIds: [], claim: '', tradeoff: 'a replica, not a cache' },
    ]);
    expect(screen.getByTestId('binding-state-c3').getAttribute('data-state')).toBe('incomplete');
  });

  it('[UX-24] offers the model’s entities beside the nodes and binds one to a criterion', async () => {
    const store = renderEditor((seeded) => {
      seeded.getState().addEntity();
      seeded.getState().updateEntity('ent-1', { name: 'Order' });
    });
    await userEvent.click(screen.getByTestId('binding-entity-c3-ent-1'));
    expect(store.getState().bindings).toEqual([
      { criterionId: 'c3', nodeIds: [], claim: '', entityIds: ['ent-1'] },
    ]);
    expect(screen.getByTestId('binding-state-c3').getAttribute('data-state')).toBe('incomplete');
  });

  it('[UX-6] binds a criterion with a claim and the components that hold it', async () => {
    const store = renderEditor();

    await userEvent.type(screen.getByTestId('binding-claim-c3'), 'Orders answers point reads');
    expect(screen.getByTestId('binding-state-c3').getAttribute('data-state')).toBe('incomplete');

    await userEvent.click(screen.getByTestId('binding-node-c3-n-4'));

    expect(store.getState().bindings).toEqual([
      { criterionId: 'c3', nodeIds: ['n-4'], claim: 'Orders answers point reads' },
    ]);
    expect(screen.getByTestId('binding-state-c3').getAttribute('data-state')).toBe('bound');
    expect(store.getState().dirty).toBe(true);
  });

  it('offers every component on the canvas — no kind decides what may hold a criterion', () => {
    renderEditor();
    const row = screen.getByTestId('binding-row-c3');
    for (const node of graph.nodes) {
      expect(within(row).getByTestId(`binding-node-c3-${node.id}`)).toBeTruthy();
    }
  });

  it('[UX-6] traces a request through the diagram, one connecting hop at a time', async () => {
    const store = renderEditor();

    await userEvent.click(screen.getByTestId('flow-open-c1'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-1'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-2'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-3'));

    expect(store.getState().bindings[0]).toEqual({
      criterionId: 'c1',
      nodeIds: [],
      claim: '',
      path: ['e-1', 'e-2', 'e-3'],
    });
    expect(screen.getByTestId('flow-status-c1').textContent).toBe('Traced · 3 hops');
  });

  /**
   * The rule the API enforces, made unrepresentable rather than validated: a
   * hop that does not continue the walk is never offered in the first place.
   */
  it('[UX-6] only offers hops that continue the walk', async () => {
    renderEditor();
    await userEvent.click(screen.getByTestId('flow-open-c1'));

    expect(screen.getByTestId('flow-hop-c1-e-1')).toBeTruthy();
    expect(screen.getByTestId('flow-hop-c1-e-3')).toBeTruthy();

    await userEvent.click(screen.getByTestId('flow-hop-c1-e-1'));

    expect(screen.getByTestId('flow-hop-c1-e-2')).toBeTruthy();
    expect(screen.queryByTestId('flow-hop-c1-e-3')).toBeNull();
  });

  it('[UX-32] shows what the lifecycle declares for the traced path: where it enters, each stage served or missing, and where it rests', async () => {
    renderEditor();
    await userEvent.click(screen.getByTestId('flow-open-c1'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-1'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-2'));

    expect(screen.getByTestId('flow-stages-c1').textContent).toContain(
      'Enters as a client at Buyer',
    );
    expect(screen.getByTestId('flow-stage-c1-ingress').textContent).toBe(
      'The access layer · Gateway',
    );
    expect(screen.getByTestId('flow-stage-c1-name-resolution').textContent).toBe(
      'Name resolution · missing',
    );
    expect(screen.getByTestId('flow-stage-c1-edge-delivery').textContent).toBe(
      'Edge delivery · where needed',
    );
    expect(screen.getByTestId('flow-rest-c1').textContent).toBe(
      'Ends at Checkout (service), which is not where a request comes to rest.',
    );

    await userEvent.click(screen.getByTestId('flow-hop-c1-e-3'));
    expect(screen.getByTestId('flow-rest-c1').textContent).toBe('Comes to rest at Orders.');
  });

  it('undoes a hop and clears a path', async () => {
    const store = renderEditor();
    await userEvent.click(screen.getByTestId('flow-open-c1'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-1'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-2'));

    await userEvent.click(screen.getByTestId('flow-undo-c1'));
    expect(store.getState().bindings[0]?.path).toEqual(['e-1']);

    await userEvent.click(screen.getByTestId('flow-clear-c1'));
    expect(store.getState().bindings).toEqual([]);
  });

  it('clears a binding outright', async () => {
    const store = renderEditor((seeded) => {
      seeded.getState().setBindingClaim('c2', 'x');
      seeded.getState().toggleBindingNode('c2', 'n-3');
    });
    await userEvent.click(screen.getByTestId('binding-clear-c2'));
    expect(store.getState().bindings).toEqual([]);
    expect(screen.getByTestId('binding-state-c2').getAttribute('data-state')).toBe('empty');
  });

  /**
   * The line the API draws and the editor must respect: impossible is refused,
   * unsupported is graded. A claim a client cannot possibly hold stays submittable.
   */
  it('never blocks an unsupported claim from being submitted', async () => {
    const store = renderEditor();
    await userEvent.type(screen.getByTestId('binding-claim-c3'), 'The buyer caches it');
    await userEvent.click(screen.getByTestId('binding-node-c3-n-1'));

    expect(store.getState().serializeBrief(criteria)).toEqual({
      version: 1,
      bindings: [{ criterionId: 'c3', nodeIds: ['n-1'], claim: 'The buyer caches it' }],
    });
  });

  it('names the components no binding accounts for yet', async () => {
    renderEditor();
    expect(screen.getByTestId('brief-unaccounted').textContent).toContain('Archive');

    await userEvent.click(screen.getByTestId('flow-open-c1'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-1'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-2'));
    await userEvent.click(screen.getByTestId('flow-hop-c1-e-3'));

    const remaining = screen.getByTestId('brief-unaccounted').textContent ?? '';
    expect(remaining).toContain('Archive');
    expect(remaining).not.toContain('Gateway');
  });

  it('says the criteria are still being normalized when there are none', () => {
    const store = createCanvasStore(graph);
    renderWithTheme(
      <CanvasStoreProvider store={store}>
        <DesignBriefEditor criteria={[]} deriving />
      </CanvasStoreProvider>,
    );
    expect(screen.getByTestId('criteria-normalizing').textContent).toContain('normalized');
    expect(screen.queryByTestId(/^binding-row-/)).toBeNull();
  });
  it('[UX-6] says how much of a claim’s limit is left as it nears — a claim is never cut off unsaid', () => {
    renderEditor((store) => {
      store.getState().setBindingClaim('c1', 'x'.repeat(BINDING_CLAIM_BOUND.target - 4));
      store.getState().setBindingClaim('c2', 'The cache absorbs repeat reads.');
    });

    const row = within(screen.getByTestId('binding-row-c1'));
    expect(row.getByText('4 characters left')).toBeTruthy();
    expect(within(screen.getByTestId('binding-row-c2')).queryByText(/characters? left/)).toBeNull();
  });
});
