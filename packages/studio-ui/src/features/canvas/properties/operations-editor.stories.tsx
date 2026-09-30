import { NODE_MAX_OPERATIONS, type NodeOperation } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { OperationsEditor } from './operations-editor';

const meta: Meta<typeof OperationsEditor> = {
  title: 'Studio/Canvas/OperationsEditor',
  component: OperationsEditor,
};
export default meta;

type Story = StoryObj<typeof OperationsEditor>;

/** Controlled the way the panel controls it: state out, changes back in. */
function Controlled({ initial }: { initial: NodeOperation[] }) {
  const [operations, setOperations] = useState(initial);
  return <OperationsEditor operations={operations} onChange={setOperations} />;
}

/** A service's endpoints: a command with a note, an idempotent query. */
export const Operations: Story = {
  render: () => (
    <Controlled
      initial={[
        { name: 'placeOrder', kind: 'command', notes: 'Validates inventory first' },
        { name: 'getOrder', kind: 'query', idempotent: true },
      ]}
    />
  ),
};

/** A queue's event, and a row whose verb the author has not stated. */
export const EventAndUnstated: Story = {
  render: () => (
    <Controlled initial={[{ name: 'OrderPlaced', kind: 'event' }, { name: 'Heartbeat' }]} />
  ),
};

/** Two rows sharing a name — the inline guard for the API's 422. */
export const DuplicateNames: Story = {
  render: () => (
    <Controlled
      initial={[
        { name: 'placeOrder', kind: 'command' },
        { name: 'placeOrder', kind: 'query' },
      ]}
    />
  ),
};

/** The contract cap: Add disables and the counter reads 12 of 12. */
export const AtCapacity: Story = {
  render: () => (
    <Controlled
      initial={Array.from({ length: NODE_MAX_OPERATIONS }, (_, index) => ({
        name: `operation${index + 1}`,
        kind: 'command' as const,
      }))}
    />
  ),
};
