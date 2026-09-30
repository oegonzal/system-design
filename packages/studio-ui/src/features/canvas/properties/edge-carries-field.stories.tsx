import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { EdgeCarriesField, type EdgeCarriesFieldProps } from './edge-carries-field';

const meta: Meta<typeof EdgeCarriesField> = {
  title: 'Studio/Canvas/EdgeCarriesField',
  component: EdgeCarriesField,
};
export default meta;

type Story = StoryObj<typeof EdgeCarriesField>;

function Controlled({
  initial,
  ...props
}: Omit<EdgeCarriesFieldProps, 'carries' | 'onChange'> & { initial: string[] }) {
  const [carries, setCarries] = useState(initial);
  return <EdgeCarriesField {...props} carries={carries} onChange={setCarries} />;
}

const client = { label: 'Client', operations: [] };
const orderService = {
  label: 'Order Service',
  operations: [
    { name: 'placeOrder', kind: 'command' as const },
    { name: 'getOrder', kind: 'query' as const, idempotent: true },
  ],
};
const orderQueue = {
  label: 'Order Queue',
  operations: [{ name: 'OrderPlaced', kind: 'event' as const }],
};

/** A call edge exercising one of the callee's two declared endpoints. */
export const DeclaredAndCarried: Story = {
  render: () => <Controlled source={client} target={orderService} initial={['placeOrder']} />,
};

/** A consume edge: the queue is the source, and its event is the candidate. */
export const FromTheSource: Story = {
  render: () => (
    <Controlled
      source={orderQueue}
      target={{ label: 'Fulfillment Worker', operations: [] }}
      initial={['OrderPlaced']}
    />
  ),
};

/** A carry that outlived its declaration: a stale chip, removable and nothing more. */
export const StaleCarry: Story = {
  render: () => (
    <Controlled source={client} target={orderService} initial={['placeOrder', 'chargeCard']} />
  ),
};

/** Neither end declares anything yet — the field says so instead of going blank. */
export const NothingDeclared: Story = {
  render: () => (
    <Controlled source={client} target={{ label: 'Orders DB', operations: [] }} initial={[]} />
  ),
};
