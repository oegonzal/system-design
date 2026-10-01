import {
  NODE_MAX_OPERATIONS,
  OPERATION_KINDS,
  OPERATION_NAME_MAX_LENGTH,
  OPERATION_NOTES_MAX_LENGTH,
  type NodeOperation,
} from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OperationsEditor } from './operations-editor';

const NO_OPS: NodeOperation[] = [];
const noop = () => undefined;

/** Controlled harness — the panel wires `onChange` back into the store the same way. */
function Harness({
  initial = NO_OPS,
  onChange = noop,
}: {
  initial?: NodeOperation[];
  onChange?: (next: NodeOperation[]) => void;
}) {
  const [operations, setOperations] = useState(initial);
  return (
    <OperationsEditor
      operations={operations}
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

    expect(screen.getByRole('group', { name: 'Operation placeOrder' })).toBe(
      screen.getByTestId('operation-row-0'),
    );
    expect(screen.getByRole('group', { name: 'Operation getOrder' })).toBe(
      screen.getByTestId('operation-row-1'),
    );
  });

  it('offers every contract kind plus "not stated" in a row’s kind select', () => {
    renderWithTheme(<Harness initial={twoOps} />);

    const select = within(screen.getByTestId('operation-row-0')).getByRole('combobox', {
      name: 'Kind',
    });
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value);
    expect(options).toEqual(['', ...OPERATION_KINDS]);
  });

  it('appends an empty command row', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={twoOps} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add operation' }));

    expect(onChange).toHaveBeenCalledWith([...twoOps, { name: '', kind: 'command' }]);
    expect(screen.getByTestId('operation-row-2')).toBeTruthy();
  });

  it('[UX-5] edits a row’s name, kind, idempotency and notes through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={twoOps} onChange={onChange} />);

    const row = within(screen.getByTestId('operation-row-0'));
    await user.type(row.getByLabelText('Name'), '!');
    await user.selectOptions(row.getByLabelText('Kind'), 'stream');
    await user.click(row.getByLabelText('Idempotent'));
    await user.type(row.getByLabelText('Notes'), 'checks stock');

    const latest = onChange.mock.calls.at(-1)?.[0] as NodeOperation[];
    expect(latest[0]).toEqual({
      name: 'placeOrder!',
      kind: 'stream',
      idempotent: true,
      notes: 'checks stock',
    });
    expect(latest[1]).toEqual(twoOps[1]);
  });

  it('"Not stated" deletes the kind rather than writing an empty string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={twoOps} onChange={onChange} />);

    await user.selectOptions(
      within(screen.getByTestId('operation-row-0')).getByLabelText('Kind'),
      '',
    );

    const [operations] = onChange.mock.lastCall as [NodeOperation[]];
    expect(operations[0]).not.toHaveProperty('kind');
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

  it('refuses Add while a duplicate name stands, so the row cannot be piled onto', () => {
    renderWithTheme(
      <Harness
        initial={[
          { name: 'placeOrder', kind: 'command' },
          { name: 'placeOrder', kind: 'query' },
        ]}
      />,
    );

    expect(
      (screen.getByRole('button', { name: 'Add operation' }) as HTMLButtonElement).disabled,
    ).toBe(true);
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
    // …and Add stays open: an unnamed row is a row still being typed.
    expect(
      (screen.getByRole('button', { name: 'Add operation' }) as HTMLButtonElement).disabled,
    ).toBe(false);
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
    expect((row.getByLabelText('Name') as HTMLInputElement).maxLength).toBe(
      OPERATION_NAME_MAX_LENGTH,
    );
    expect((row.getByLabelText('Notes') as HTMLInputElement).maxLength).toBe(
      OPERATION_NOTES_MAX_LENGTH,
    );
  });
});
