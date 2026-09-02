import type { CanvasGraph, PromptDto } from '@sysdesign/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createCanvasStore } from '../../canvas/canvas-store';
import { CanvasStoreProvider } from '../../canvas/canvas-store-context';
import { makeOrderHistoryGraph, makeWorkflowPrompt } from '../../../testing/fixtures';
import { renderWithTheme } from '../../../testing/render';
import { DesignBriefEditor } from './design-brief-editor';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Buyer' },
    { id: 'n-2', kind: 'gateway', label: 'Gateway', config: { rateLimit: true } },
    { id: 'n-3', kind: 'service', label: 'Checkout' },
    { id: 'n-4', kind: 'database', label: 'Orders', config: { backups: true } },
    { id: 'n-5', kind: 'database', label: 'Archive' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
    { id: 'e-3', source: 'n-3', target: 'n-4', kind: 'sync' },
  ],
};

const prompt = {
  id: 'pr-1',
  title: 'Flash sale',
  functionalRequirements: ['Reserve a seat', 'Show remaining stock'],
  nonFunctionalRequirements: [
    { id: 'nfr-dur', kind: 'durability', statement: 'Orders survive a node loss' },
    { id: 'nfr-sec', kind: 'security', statement: 'Only signed-in buyers may purchase' },
  ],
} as unknown as PromptDto;

function renderEditor(seed?: (store: ReturnType<typeof createCanvasStore>) => void) {
  const store = createCanvasStore(graph);
  seed?.(store);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <DesignBriefEditor prompt={prompt} />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('DesignBriefEditor', () => {
  it('[UX-6] binds a requirement to the components that hold it', async () => {
    const store = renderEditor();

    await userEvent.selectOptions(screen.getByTestId('binding-mechanism-nfr-dur'), 'backups');
    await userEvent.click(screen.getByTestId('binding-node-nfr-dur-n-4'));

    expect(store.getState().briefBindings).toEqual([
      { nfrId: 'nfr-dur', mechanism: 'backups', nodeIds: ['n-4'] },
    ]);
    expect(store.getState().dirty).toBe(true);
  });

  it('[UX-6] traces a request through the diagram, one connecting hop at a time', async () => {
    const store = renderEditor();

    await userEvent.click(screen.getByTestId('flow-hop-0-e-1'));
    await userEvent.click(screen.getByTestId('flow-hop-0-e-2'));
    await userEvent.click(screen.getByTestId('flow-hop-0-e-3'));

    expect(store.getState().briefFlows).toEqual([
      { id: 'flow-0', requirementIndex: 0, path: ['e-1', 'e-2', 'e-3'] },
    ]);
    expect(screen.getByTestId('flow-status-0').textContent).toContain('Traced end to end');
  });

  /**
   * The rule the API enforces, made unrepresentable rather than validated: a
   * hop that does not continue the walk is never offered in the first place.
   */
  it('[UX-6] only offers hops that continue the walk', async () => {
    renderEditor();

    // Before any hop, every edge is a legal start.
    expect(screen.getByTestId('flow-hop-0-e-1')).toBeTruthy();
    expect(screen.getByTestId('flow-hop-0-e-3')).toBeTruthy();

    await userEvent.click(screen.getByTestId('flow-hop-0-e-1'));

    // e-1 arrives at the gateway, so only the edge leaving it may follow.
    expect(screen.getByTestId('flow-hop-0-e-2')).toBeTruthy();
    expect(screen.queryByTestId('flow-hop-0-e-3')).toBeNull();
  });

  it('offers only components whose kind can carry the chosen mechanism', async () => {
    renderEditor();
    await userEvent.selectOptions(screen.getByTestId('binding-mechanism-nfr-dur'), 'backups');

    // Both databases are eligible; the gateway and client are not offered at all.
    expect(screen.getByTestId('binding-node-nfr-dur-n-4')).toBeTruthy();
    expect(screen.getByTestId('binding-node-nfr-dur-n-5')).toBeTruthy();
    expect(screen.queryByTestId('binding-node-nfr-dur-n-2')).toBeNull();
    expect(screen.queryByTestId('binding-node-nfr-dur-n-1')).toBeNull();
  });

  it('drops components the new mechanism cannot carry when the claim changes', async () => {
    const store = renderEditor();
    await userEvent.selectOptions(screen.getByTestId('binding-mechanism-nfr-dur'), 'backups');
    await userEvent.click(screen.getByTestId('binding-node-nfr-dur-n-4'));
    // A database can hold backups but not rate limiting.
    await userEvent.selectOptions(screen.getByTestId('binding-mechanism-nfr-dur'), 'rate-limit');

    expect(store.getState().briefBindings[0]).toMatchObject({
      mechanism: 'rate-limit',
      nodeIds: [],
    });
  });

  it('shows the engine verdict live, and says what would corroborate an unproven claim', async () => {
    renderEditor();
    await userEvent.selectOptions(screen.getByTestId('binding-mechanism-nfr-dur'), 'backups');

    // n-4 has backups configured; n-5 does not.
    await userEvent.click(screen.getByTestId('binding-node-nfr-dur-n-4'));
    const row = screen.getByTestId('binding-row-nfr-dur');
    expect(within(row).getByTestId('mechanism-verdict').getAttribute('data-tone')).toBe(
      'corroborated',
    );

    await userEvent.click(screen.getByTestId('binding-node-nfr-dur-n-4'));
    await userEvent.click(screen.getByTestId('binding-node-nfr-dur-n-5'));
    expect(within(row).getByTestId('mechanism-verdict').getAttribute('data-tone')).toBe(
      'uncorroborated',
    );
    // Not a mystery: corroboration is non-uniform, so the row says what it wants.
    expect(within(row).getByTestId('mechanism-proof').textContent).toContain('backups enabled');
  });

  /**
   * The line the API draws and the editor must respect: impossible is refused,
   * unsupported is graded. An unproven claim stays submittable.
   */
  it('never blocks an uncorroborated claim from being submitted', async () => {
    const store = renderEditor();
    await userEvent.selectOptions(screen.getByTestId('binding-mechanism-nfr-dur'), 'backups');
    await userEvent.click(screen.getByTestId('binding-node-nfr-dur-n-5'));

    expect(store.getState().serializeBrief()).toEqual({
      version: 1,
      nfrBindings: [{ nfrId: 'nfr-dur', mechanism: 'backups', nodeIds: ['n-5'] }],
      flows: [],
    });
  });

  it('names the components nothing in the brief accounts for yet', async () => {
    renderEditor();
    expect(screen.getByTestId('brief-unaccounted').textContent).toContain('Archive');

    await userEvent.click(screen.getByTestId('flow-hop-0-e-1'));
    await userEvent.click(screen.getByTestId('flow-hop-0-e-2'));
    await userEvent.click(screen.getByTestId('flow-hop-0-e-3'));

    // The traced walk now accounts for everything but the archive.
    const remaining = screen.getByTestId('brief-unaccounted').textContent ?? '';
    expect(remaining).toContain('Archive');
    expect(remaining).not.toContain('Gateway');
  });

  it('says plainly that a canvas with nothing eligible is not an error', async () => {
    renderEditor();
    // No queue exists, so nothing can carry a dead-letter queue.
    await userEvent.selectOptions(screen.getByTestId('binding-mechanism-nfr-sec'), 'dlq');
    expect(screen.getByTestId('binding-no-candidates-nfr-sec').textContent).toContain('a queue');
  });
});

describe('DesignBriefEditor — workflow coverage', () => {
  it('renders the Workflow section only when the prompt carries a spec', () => {
    renderEditor();
    expect(screen.queryByTestId('workflow-coverage')).toBeNull();
  });

  it('[PRD-4] chips show the verdict the grade will use, live: designing the coverage flips the tone', () => {
    const workflowPrompt = makeWorkflowPrompt();
    const bare = createCanvasStore({ nodes: [], edges: [] });
    const { unmount } = renderWithTheme(
      <CanvasStoreProvider store={bare}>
        <DesignBriefEditor prompt={workflowPrompt} />
      </CanvasStoreProvider>,
    );
    // An empty canvas: the serving query is not started.
    expect(screen.getByTestId('workflow-verdict-op-list-orders').getAttribute('data-tone')).toBe(
      'empty',
    );
    unmount();

    // The order-history graph fulfils and carries it — same judge, new verdict.
    const covered = createCanvasStore(makeOrderHistoryGraph());
    renderWithTheme(
      <CanvasStoreProvider store={covered}>
        <DesignBriefEditor prompt={workflowPrompt} />
      </CanvasStoreProvider>,
    );
    expect(screen.getByTestId('workflow-verdict-op-list-orders').getAttribute('data-tone')).toBe(
      'corroborated',
    );
    // The pull ingest is not drawn in that graph — its chip stays honest.
    const pull = screen.getByTestId('workflow-verdict-ing-pos-import');
    expect(pull.getAttribute('data-tone')).toBe('empty');
    expect(pull.textContent).toContain('Not started');
  });
});
