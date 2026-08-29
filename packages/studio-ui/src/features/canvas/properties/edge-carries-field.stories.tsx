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

const orderServiceOps = [
  { name: 'placeOrder', kind: 'command' as const },
  { name: 'getOrder', kind: 'query' as const, idempotent: true },
];

/** A call edge exercising one of the callee's two declared endpoints. */
export const DeclaredAndCarried: Story = {
  render: () => (
    <Controlled ownerLabel="Order Service" declaredOps={orderServiceOps} initial={['placeOrder']} />
  ),
};

/** A carry the owner never declared: warning chip, hint, still removable. */
export const UndeclaredCarry: Story = {
  render: () => (
    <Controlled
      ownerLabel="Order Service"
      declaredOps={orderServiceOps}
      initial={['placeOrder', 'chargeCard']}
    />
  ),
};

/** The owner declares nothing yet — the field says so instead of going blank. */
export const OwnerUndeclared: Story = {
  render: () => <Controlled ownerLabel="Order Queue" declaredOps={[]} initial={[]} />,
};
