import { NODE_MAX_OPERATIONS, type NodeOperation } from '@sysdesign/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
}: {
  initial?: NodeOperation[];
  allowedKinds?: OperationsEditorProps['allowedKinds'];
  heading?: string;
  onChange?: OperationsEditorProps['onChange'];
}) {
  const [operations, setOperations] = useState(initial);
  return (
    <OperationsEditor
      operations={operations}
      allowedKinds={allowedKinds}
      heading={heading}
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
