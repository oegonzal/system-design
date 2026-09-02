import { NODE_MAX_OPERATIONS, type NodeOperation } from '@sysdesign/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { makeWorkflowSpec } from '../../../testing/fixtures';
import { renderWithTheme } from '../../../testing/render';
import { OperationsEditor, type OperationsEditorProps } from './operations-editor';

const NO_OPS: NodeOperation[] = [];
const DEFAULT_KINDS = ['command', 'query'] as const;
const noop = () => undefined;

/** Controlled harness — the panel wires `onChange` back into the store the same way. */
function Harness({
  initial = NO_OPS,
  allowedKinds = DEFAULT_KINDS,
  heading = 'Operations',
  onChange = noop,
  workflow = null,
}: {
  initial?: NodeOperation[];
  allowedKinds?: OperationsEditorProps['allowedKinds'];
  heading?: string;
  onChange?: OperationsEditorProps['onChange'];
  workflow?: OperationsEditorProps['workflow'];
}) {
  const [operations, setOperations] = useState(initial);
  return (
    <OperationsEditor
      operations={operations}
      allowedKinds={allowedKinds}
      heading={heading}
      workflow={workflow}
      onChange={(next) => {
        setOperations(next);
        onChange(next);
      }}
    />
  );
}

const twoOps: NodeOperation[] = [
  { name: 'placeOrder', kind: 'command' },
  { name: 'getOrder', kind: 'query', idempotent: true },
];

describe('OperationsEditor', () => {
  it('renders one named, grouped row per operation', () => {
    renderWithTheme(<Harness initial={twoOps} />);

    expect(screen.getByRole('heading', { level: 4, name: 'Operations' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Operation placeOrder' })).toBe(
      screen.getByTestId('operation-row-0'),
    );
    expect(screen.getByRole('group', { name: 'Operation getOrder' })).toBe(
      screen.getByTestId('operation-row-1'),
    );
  });

  it('offers only the allowed kinds in a row’s kind select', () => {
    renderWithTheme(<Harness initial={twoOps} allowedKinds={['command', 'stream']} />);

    const select = within(screen.getByTestId('operation-row-0')).getByRole('combobox', {
      name: 'Kind',
    });
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value);
    expect(options).toEqual(['command', 'stream']);
  });

  it('appends an empty operation of the first allowed kind', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(
      <Harness initial={twoOps} allowedKinds={['event', 'stream']} onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Add operation' }));

    expect(onChange).toHaveBeenCalledWith([...twoOps, { name: '', kind: 'event' }]);
    expect(screen.getByTestId('operation-row-2')).toBeTruthy();
  });

  it('edits a row’s fields through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={twoOps} onChange={onChange} />);

    const row = within(screen.getByTestId('operation-row-0'));
    await user.type(row.getByLabelText('Name'), '!');
    await user.click(row.getByLabelText('Idempotent'));
    await user.type(row.getByLabelText('Notes'), 'checks stock');

    const latest = onChange.mock.calls.at(-1)?.[0] as NodeOperation[];
    expect(latest[0]).toEqual({
      name: 'placeOrder!',
      kind: 'command',
      idempotent: true,
      notes: 'checks stock',
    });
    expect(latest[1]).toEqual(twoOps[1]);
  });

  it('removes a row via its named remove button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={twoOps} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Remove operation placeOrder' }));

    expect(onChange).toHaveBeenCalledWith([twoOps[1]]);
    expect(screen.queryByTestId('operation-row-1')).toBeNull();
  });

  it('warns inline on rows whose names duplicate another (the API would 422)', () => {
    renderWithTheme(
      <Harness
        initial={[
          { name: 'placeOrder', kind: 'command' },
          { name: 'getOrder', kind: 'query' },
          { name: 'placeOrder', kind: 'query' },
        ]}
      />,
    );

    expect(screen.getByTestId('operation-duplicate-0')).toBeTruthy();
    expect(screen.queryByTestId('operation-duplicate-1')).toBeNull();
    expect(screen.getByTestId('operation-duplicate-2').textContent).toMatch(/duplicate name/i);
  });

  it('never flags two still-unnamed rows as duplicates', () => {
    renderWithTheme(
      <Harness
        initial={[
          { name: '', kind: 'command' },
          { name: '', kind: 'command' },
        ]}
      />,
    );

    expect(screen.queryByTestId('operation-duplicate-0')).toBeNull();
    expect(screen.queryByTestId('operation-duplicate-1')).toBeNull();
  });

  it(`disables Add at the contract cap of ${NODE_MAX_OPERATIONS} and shows the counter`, () => {
    const full = Array.from({ length: NODE_MAX_OPERATIONS }, (_, index) => ({
      name: `op${index}`,
      kind: 'command' as const,
    }));
    renderWithTheme(<Harness initial={full} />);

    expect(
      (screen.getByRole('button', { name: 'Add operation' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(`${NODE_MAX_OPERATIONS} of ${NODE_MAX_OPERATIONS}`)).toBeTruthy();
  });

  it('caps name and notes input lengths to the contract', () => {
    renderWithTheme(<Harness initial={twoOps} />);

    const row = within(screen.getByTestId('operation-row-0'));
    expect((row.getByLabelText('Name') as HTMLInputElement).maxLength).toBe(60);
    expect((row.getByLabelText('Notes') as HTMLInputElement).maxLength).toBe(140);
  });
});

describe('OperationsEditor — workflow claims', () => {
  const spec = makeWorkflowSpec();
  const api = { spec, role: 'api' as const };

  it('[PRD-2] the Fulfills select offers only ids the spec declares for this role and the row’s kind — never free text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(
      <Harness
        initial={[{ name: 'listOrders', kind: 'query' }]}
        workflow={api}
        onChange={onChange}
      />,
    );

    const select = screen.getByTestId('operation-fulfills-0') as HTMLSelectElement;
    // Query rows see query contracts + aggregations, never commands or events.
    expect([...select.options].map((option) => option.value)).toEqual([
      '',
      'op-list-orders',
      'agg-spend-summary',
    ]);

    await user.selectOptions(select, 'op-list-orders');
    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'listOrders', kind: 'query', fulfills: 'op-list-orders' },
    ]);
  });

  it('renders no workflow controls at all without a spec — the default surface is untouched', () => {
    renderWithTheme(<Harness initial={twoOps} />);
    expect(screen.queryByTestId('operation-fulfills-0')).toBeNull();
    expect(screen.queryByTestId('operation-emit-0-evt-order-received')).toBeNull();
  });

  it('keeps the claim on a kind flip and warns instead — silently deleting a claim is hostile', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Harness
        initial={[{ name: 'ingest', kind: 'command', fulfills: 'op-ingest-index' }]}
        workflow={api}
      />,
    );
    expect(screen.queryByTestId('operation-workflow-warning-0')).toBeNull();

    const row = within(screen.getByTestId('operation-row-0'));
    await user.selectOptions(row.getByLabelText('Kind'), 'query');

    expect(screen.getByTestId('operation-workflow-warning-0').textContent).toContain(
      'op-ingest-index',
    );
  });

  it('offers emissions on command rows only, capped at the contract', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Harness
        initial={[
          { name: 'do', kind: 'command' },
          { name: 'read', kind: 'query' },
        ]}
        workflow={api}
      />,
    );

    // Command row: one checkbox per spec event.
    await user.click(screen.getByTestId('operation-emit-0-evt-order-received'));
    expect(
      (screen.getByTestId('operation-emit-0-evt-order-received') as HTMLInputElement).checked,
    ).toBe(true);
    // Query row: no emissions surface at all.
    expect(screen.queryByTestId('operation-emit-1-evt-order-received')).toBeNull();
  });

  it('"Not linked" deletes the claim rather than writing an empty string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(
      <Harness
        initial={[{ name: 'listOrders', kind: 'query', fulfills: 'op-list-orders' }]}
        workflow={api}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByTestId('operation-fulfills-0'), '');
    const [operations] = onChange.mock.lastCall as [NodeOperation[]];
    expect(operations[0].fulfills).toBeUndefined();
  });
});
