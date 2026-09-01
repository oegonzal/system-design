import type { BriefBindingProposal, CanvasGraph, PromptDto } from '@sysdesign/contracts';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createCanvasStore } from '../../canvas/canvas-store';
import { CanvasStoreProvider } from '../../canvas/canvas-store-context';
import { renderWithTheme } from '../../../testing/render';
import { DesignBriefEditor } from './design-brief-editor';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Buyer' },
    { id: 'n-2', kind: 'gateway', label: 'Gateway', config: { rateLimit: true } },
    { id: 'n-3', kind: 'database', label: 'Orders', config: { backups: true } },
    { id: 'n-4', kind: 'database', label: 'Archive' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
  ],
};

const prompt = {
  id: 'pr-1',
  title: 'Flash sale',
  functionalRequirements: ['Reserve a seat'],
  nonFunctionalRequirements: [
    { id: 'nfr-dur', kind: 'durability', statement: 'Orders survive a node loss' },
    { id: 'nfr-sec', kind: 'security', statement: 'Only signed-in buyers may purchase' },
  ],
} as unknown as PromptDto;

const proposal = (overrides: Partial<BriefBindingProposal> = {}): BriefBindingProposal => ({
  nfrId: 'nfr-dur',
  mechanism: 'backups',
  nodeIds: ['n-3'],
  rationale: 'The orders database has backups configured.',
  ...overrides,
});

function renderEditor(seed?: (store: ReturnType<typeof createCanvasStore>) => void) {
  const store = createCanvasStore(graph);
  seed?.(store);
  // No sessionId: nothing is asked of the API, so the panel stays out and these
  // assert the proposal lifecycle alone.
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <DesignBriefEditor prompt={prompt} />
    </CanvasStoreProvider>,
  );
  return store;
}

describe('binding proposals', () => {
  /**
   * The landmine this feature is built around: `serializeBrief` reads
   * `briefBindings` wholesale, so a proposal parked there would be submitted.
   * Proposals live in their own slice precisely so that cannot happen.
   */
  it('[UX-9] an unaccepted proposal is never part of the submitted brief', () => {
    const store = renderEditor((created) => created.getState().loadProposals([proposal()]));

    expect(screen.getByTestId('binding-proposal-nfr-dur')).toBeTruthy();
    expect(store.getState().serializeBrief()).toBeNull();
    expect(store.getState().dirty).toBe(false);
  });

  it('[UX-9] accepting turns it into the author’s own binding', async () => {
    const store = renderEditor((created) => created.getState().loadProposals([proposal()]));

    await userEvent.click(screen.getByTestId('accept-proposal-nfr-dur'));

    expect(store.getState().serializeBrief()).toEqual({
      version: 1,
      nfrBindings: [{ nfrId: 'nfr-dur', mechanism: 'backups', nodeIds: ['n-3'] }],
      flows: [],
    });
    expect(store.getState().dirty).toBe(true);
    // The proposal is spent, not left hanging beside the binding it became.
    expect(screen.queryByTestId('binding-proposal-nfr-dur')).toBeNull();
  });

  it('[UX-9] dismissing leaves no trace and changes nothing', async () => {
    const store = renderEditor((created) => created.getState().loadProposals([proposal()]));

    await userEvent.click(screen.getByTestId('dismiss-proposal-nfr-dur'));

    expect(screen.queryByTestId('binding-proposal-nfr-dur')).toBeNull();
    expect(store.getState().serializeBrief()).toBeNull();
    expect(store.getState().dirty).toBe(false);
  });

  /**
   * The model is not an oracle. A proposal the canvas cannot back up costs
   * marks if accepted, so the author must be able to see that before deciding.
   */
  it('[UX-9] shows the same verdict the grade will use, corroborated or not', () => {
    renderEditor((created) =>
      created.getState().loadProposals([
        proposal(),
        // The archive declares no backups — eligible, but unproven.
        proposal({ nfrId: 'nfr-sec', nodeIds: ['n-4'], rationale: 'Also a database.' }),
      ]),
    );

    const backed = within(screen.getByTestId('binding-proposal-nfr-dur'));
    expect(backed.getByTestId('mechanism-verdict').getAttribute('data-tone')).toBe('corroborated');

    const unproven = within(screen.getByTestId('binding-proposal-nfr-sec'));
    expect(unproven.getByTestId('mechanism-verdict').getAttribute('data-tone')).toBe(
      'uncorroborated',
    );
  });

  it('warns before overwriting a binding the author already made', async () => {
    const store = renderEditor((created) => {
      created.getState().setBindingMechanism('nfr-dur', 'failover');
      created.getState().toggleBindingNode('nfr-dur', 'n-3');
      created.getState().loadProposals([proposal()]);
    });

    expect(screen.getByTestId('proposal-replaces-nfr-dur').textContent).toContain('Failover');

    await userEvent.click(screen.getByTestId('accept-proposal-nfr-dur'));
    expect(store.getState().briefBindings).toEqual([
      { nfrId: 'nfr-dur', mechanism: 'backups', nodeIds: ['n-3'] },
    ]);
  });

  it('never writes the model’s rationale into the author’s note', async () => {
    const store = renderEditor((created) => created.getState().loadProposals([proposal()]));
    await userEvent.click(screen.getByTestId('accept-proposal-nfr-dur'));

    // `note` is the author's own reasoning; model prose stored there would
    // misrepresent who wrote it.
    expect(store.getState().briefBindings[0]).not.toHaveProperty('note');
  });

  it('offers no way to accept everything at once', () => {
    renderEditor((created) =>
      created.getState().loadProposals([proposal(), proposal({ nfrId: 'nfr-sec' })]),
    );
    expect(screen.queryByTestId('accept-all-proposals')).toBeNull();
    expect(screen.getAllByTestId(/^accept-proposal-/)).toHaveLength(2);
  });

  it('drops proposals when a different revision is loaded', () => {
    const store = renderEditor((created) => created.getState().loadProposals([proposal()]));
    // Wrapped because this re-renders the mounted editor, exactly as loading a
    // revision does in the workspace.
    act(() => store.getState().setGraph(graph));
    expect(store.getState().briefProposals).toEqual([]);
  });
});
