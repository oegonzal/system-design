import { EDGE_MAX_CARRIES, type NodeOperation } from '@sysdesign/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../../testing/render';
import { EdgeCarriesField } from './edge-carries-field';

const declaredOps: NodeOperation[] = [
  { name: 'placeOrder', kind: 'command' },
  { name: 'getOrder', kind: 'query', idempotent: true },
];

const NONE: string[] = [];
const noop = () => undefined;

function Harness({
  initial = NONE,
  ownerLabel = 'Order Service',
  ops = declaredOps,
  onChange = noop,
}: {
  initial?: string[];
  ownerLabel?: string;
  ops?: NodeOperation[];
  onChange?: (next: string[]) => void;
}) {
  const [carries, setCarries] = useState(initial);
  return (
    <EdgeCarriesField
      carries={carries}
      ownerLabel={ownerLabel}
      declaredOps={ops}
      onChange={(next) => {
        setCarries(next);
        onChange(next);
      }}
    />
  );
}

describe('EdgeCarriesField', () => {
  it('renders one checkbox per declared operation, labelled name · kind', () => {
    renderWithTheme(<Harness initial={['getOrder']} />);

    const place = screen.getByLabelText('placeOrder · command') as HTMLInputElement;
    const get = screen.getByLabelText('getOrder · query') as HTMLInputElement;
    expect(place.checked).toBe(false);
    expect(get.checked).toBe(true);
  });

  it('checking and unchecking a declared operation round-trips onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={['getOrder']} onChange={onChange} />);

    await user.click(screen.getByLabelText('placeOrder · command'));
    expect(onChange).toHaveBeenLastCalledWith(['getOrder', 'placeOrder']);

    await user.click(screen.getByLabelText('getOrder · query'));
    expect(onChange).toHaveBeenLastCalledWith(['placeOrder']);
  });

  it('flags a carry the owner never declared, with a removable warning chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={['mysteryCall']} onChange={onChange} />);

    expect(screen.getByText('mysteryCall')).toBeTruthy();
    expect(screen.getByText('not declared on Order Service')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Remove carry mysteryCall' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('free-adds an undeclared carry on Enter — allowed, the eval grades it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness onChange={onChange} />);

    const input = screen.getByLabelText('Carry an undeclared operation') as HTMLInputElement;
    await user.type(input, '  chargeCard  {Enter}');

    expect(onChange).toHaveBeenCalledWith(['chargeCard']);
    expect(input.value).toBe('');
    expect(screen.getByText('not declared on Order Service')).toBeTruthy();
  });

  it('dedupes the free-add against carries already listed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={['placeOrder']} onChange={onChange} />);

    await user.type(screen.getByLabelText('Carry an undeclared operation'), 'placeOrder{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it(`caps carries at the DTO's ${EDGE_MAX_CARRIES}: unchecked boxes and the free-add disable`, () => {
    const full = Array.from({ length: EDGE_MAX_CARRIES }, (_, index) => `call-${index}`);
    renderWithTheme(<Harness initial={[...full.slice(0, EDGE_MAX_CARRIES - 1), 'getOrder']} />);

    expect((screen.getByLabelText('placeOrder · command') as HTMLInputElement).disabled).toBe(true);
    // A checked box stays operable — removing must always be possible.
    expect((screen.getByLabelText('getOrder · query') as HTMLInputElement).disabled).toBe(false);
    expect(
      (screen.getByLabelText('Carry an undeclared operation') as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('says so when the owner declares nothing yet', () => {
    renderWithTheme(<Harness ops={[]} ownerLabel="Order Queue" />);

    expect(screen.getByText('No operations declared on Order Queue yet.')).toBeTruthy();
  });
});
