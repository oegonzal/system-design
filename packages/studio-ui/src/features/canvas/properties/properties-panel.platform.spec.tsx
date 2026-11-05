import {
  EDGE_CONFIG_HINTS,
  PLATFORM_IDS,
  platformCatalogue,
  type CanvasGraph,
} from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeGraph, makePlatformGraph } from '../../../testing/canvas-fixtures';
import { createCanvasStore, type CanvasStore } from '../canvas-store';
import { CanvasStoreProvider } from '../canvas-store-context';
import { serviceOf } from '../platform-services';
import { PropertiesPanel } from './properties-panel';

const aws = platformCatalogue(PLATFORM_IDS[0]);

function renderPanel(
  graph: CanvasGraph,
  select: string,
  catalogue: typeof aws | null = aws,
): CanvasStore {
  const store = createCanvasStore(graph);
  store.getState().select(select);
  renderWithTheme(
    <CanvasStoreProvider store={store}>
      <PropertiesPanel catalogue={catalogue} />
    </CanvasStoreProvider>,
  );
  return store;
}

const nodeOf = (store: CanvasStore, id: string) =>
  store.getState().nodes.find((node) => node.id === id)?.data;

describe('PropertiesPanel on a platform', () => {
  it('[UX-31] offers the catalogue’s services by shelf, with none first, and shows the named service’s own guide', () => {
    renderPanel(makePlatformGraph(), 'n-4');
    const select = screen.getByTestId('service-select') as HTMLSelectElement;
    expect(select.value).toBe('aws.sqs');
    expect(select.options[0].textContent).toBe('None — role only');
    const groups = within(select).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('label'))).toEqual(
      aws.categories.map((category) => category.label),
    );
    const sqs = serviceOf('aws.sqs');
    expect(screen.getByTestId('kind-guide').textContent).toContain(sqs.what);
    expect(screen.getByTestId('kind-guide').textContent).toContain(sqs.whenToUse);
  });

  it('[UX-31] choosing a service makes the block that service in its first role; the Kind select then offers only the roles it plays', async () => {
    const user = userEvent.setup();
    const store = renderPanel(makeGraph(), 'n-3');
    expect(screen.queryByText('None — role only')).not.toBeNull();

    await user.selectOptions(screen.getByTestId('service-select'), 'aws.lambda');
    expect(nodeOf(store, 'n-3')).toMatchObject({
      kind: 'serverless-function',
      service: 'aws.lambda',
    });
    const kind = screen.getByLabelText('Kind') as HTMLSelectElement;
    expect([...kind.options].map((option) => option.value)).toEqual([
      ...serviceOf('aws.lambda').roles,
    ]);

    // A role the service plays keeps the service; one it does not play takes it off.
    await user.selectOptions(kind, 'worker');
    expect(nodeOf(store, 'n-3')).toMatchObject({ kind: 'worker', service: 'aws.lambda' });
    await user.selectOptions(screen.getByTestId('service-select'), '');
    expect(nodeOf(store, 'n-3')?.service).toBeUndefined();
    expect(nodeOf(store, 'n-3')?.kind).toBe('worker');
  });

  it('[UX-31] offers the service’s knobs as chips that fill the draft key, only the ones not yet set', async () => {
    const user = userEvent.setup();
    renderPanel(makePlatformGraph(), 'n-4');
    const hints = screen.getByTestId('config-hints');
    const chips = within(hints)
      .getAllByRole('button')
      .map((button) => button.textContent);
    const knobs = serviceOf('aws.sqs').knobs.filter((knob) => knob !== 'queueType');
    expect(chips).toEqual(knobs);
    await user.click(within(hints).getByText('dlq'));
    expect((screen.getByTestId('config-key') as HTMLInputElement).value).toBe('dlq');
  });

  it('[UX-31] a block that names a service shows the Service control on a neutral session too; a plain block on a neutral session shows none', () => {
    renderPanel(makePlatformGraph(), 'n-2', null);
    expect((screen.getByTestId('service-select') as HTMLSelectElement).value).toBe(
      'aws.api-gateway',
    );
  });

  it('[UX-31] a plain block on a neutral session has no Service control and the kind’s own guide', () => {
    renderPanel(makeGraph(), 'n-3', null);
    expect(screen.queryByTestId('service-select')).toBeNull();
    expect(screen.getByTestId('kind-guide')).toBeTruthy();
  });

  it('[EVAL-6] a connection carries free-form config, offered the hop keys as chips, written through the store', async () => {
    const user = userEvent.setup();
    const store = renderPanel(makePlatformGraph(), 'e-3');
    const section = screen.getByTestId('edge-config-section');
    expect(within(section).getByTestId('config-row-delivery')).toBeTruthy();
    const chips = within(section)
      .getAllByTestId(/^config-hint-/)
      .map((chip) => chip.textContent);
    expect(chips).toEqual(
      EDGE_CONFIG_HINTS.filter((hint) => hint !== 'dlq' && hint !== 'delivery'),
    );

    await user.click(within(section).getByTestId('config-hint-timeoutMs'));
    await user.type(within(section).getByTestId('config-value'), '500');
    await user.click(within(section).getByTestId('config-add'));
    expect(store.getState().edges.find((edge) => edge.id === 'e-3')?.data?.config).toEqual([
      { key: 'delivery', value: 'at-least-once' },
      { key: 'dlq', value: true },
      { key: 'timeoutMs', value: 500 },
    ]);
  });
});
