import { EDGE_CARRIES_BOUND } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EdgeCarriesField, type CarriesEndpoint } from './edge-carries-field';

const client: CarriesEndpoint = { label: 'Client', operations: [] };
const service: CarriesEndpoint = {
  label: 'Order Service',
  operations: [
    { name: 'placeOrder', kind: 'command' },
    { name: 'getOrder', kind: 'query', idempotent: true },
  ],
};
const queue: CarriesEndpoint = {
  label: 'Order Queue',
  operations: [{ name: 'OrderPlaced', kind: 'event' }],
};

const NONE: string[] = [];
const noop = () => undefined;

function Harness({
  initial = NONE,
  source = client,
  target = service,
  onChange = noop,
}: {
  initial?: string[];
  source?: CarriesEndpoint;
  target?: CarriesEndpoint;
  onChange?: (next: string[]) => void;
}) {
  const [carries, setCarries] = useState(initial);
  return (
    <EdgeCarriesField
      carries={carries}
      source={source}
      target={target}
      onChange={(next) => {
        setCarries(next);
        onChange(next);
      }}
    />
  );
}

describe('EdgeCarriesField', () => {
  it('renders one checkbox per operation the target declares, labelled name · kind · owner', () => {
    renderWithTheme(<Harness initial={['getOrder']} />);

    const place = screen.getByLabelText('placeOrder · command · Order Service') as HTMLInputElement;
    const get = screen.getByLabelText('getOrder · query · Order Service') as HTMLInputElement;
    expect(place.checked).toBe(false);
    expect(get.checked).toBe(true);
  });

  it('[UX-5] offers the source’s declarations too — a queue’s event on its consume edge', () => {
    renderWithTheme(<Harness source={queue} target={{ label: 'Worker', operations: [] }} />);
    expect(screen.getByLabelText('OrderPlaced · event · Order Queue')).toBeTruthy();
  });

  it('merges a name both ends declare into one candidate owned by both', () => {
    renderWithTheme(
      <Harness
        source={{ label: 'Gateway', operations: [{ name: 'placeOrder', kind: 'command' }] }}
        target={service}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByLabelText('placeOrder · command · Gateway, Order Service')).toBeTruthy();
  });

  it('checking and unchecking round-trips onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={['getOrder']} onChange={onChange} />);

    await user.click(screen.getByLabelText('placeOrder · command · Order Service'));
    expect(onChange).toHaveBeenLastCalledWith(['getOrder', 'placeOrder']);

    await user.click(screen.getByLabelText('getOrder · query · Order Service'));
    expect(onChange).toHaveBeenLastCalledWith(['placeOrder']);
  });

  it('shows a carry neither end declares any more as a stale chip that can only be removed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Harness initial={['mysteryCall']} onChange={onChange} />);

    expect(screen.getByTestId('carry-stale-mysteryCall').textContent).toContain('mysteryCall');
    expect(screen.queryByRole('textbox')).toBeNull(); // no free-add

    await user.click(screen.getByRole('button', { name: 'Remove carry mysteryCall' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it(`caps carries at the DTO's ${EDGE_CARRIES_BOUND.target}: unchecked boxes disable`, () => {
    const full = Array.from(
      { length: EDGE_CARRIES_BOUND.target - 1 },
      (_, index) => `call-${index}`,
    );
    renderWithTheme(<Harness initial={[...full, 'getOrder']} />);

    expect(
      (screen.getByLabelText('placeOrder · command · Order Service') as HTMLInputElement).disabled,
    ).toBe(true);
    // A checked box stays operable — removing must always be possible.
    expect(
      (screen.getByLabelText('getOrder · query · Order Service') as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it('says so when neither end declares anything yet', () => {
    renderWithTheme(<Harness source={client} target={{ label: 'Orders DB', operations: [] }} />);
    expect(screen.getByText(/Neither Client nor Orders DB declares an operation yet/)).toBeTruthy();
  });
});
