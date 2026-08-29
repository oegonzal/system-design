import { NODE_MAX_OPERATIONS, type NodeOperation } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { OperationsEditor, type OperationsEditorProps } from './operations-editor';

const meta: Meta<typeof OperationsEditor> = {
  title: 'Studio/Canvas/OperationsEditor',
  component: OperationsEditor,
};
export default meta;

type Story = StoryObj<typeof OperationsEditor>;

/** Controlled the way the panel controls it: state out, changes back in. */
function Controlled({
  initial,
  ...props
}: Omit<OperationsEditorProps, 'operations' | 'onChange'> & { initial: NodeOperation[] }) {
  const [operations, setOperations] = useState(initial);
  return <OperationsEditor {...props} operations={operations} onChange={setOperations} />;
}

/** An api-role node's endpoints: commands and queries only. */
export const Operations: Story = {
  render: () => (
    <Controlled
      heading="Operations"
      allowedKinds={['command', 'query']}
      initial={[
        { name: 'placeOrder', kind: 'command', notes: 'Validates inventory first' },
        { name: 'getOrder', kind: 'query', idempotent: true },
      ]}
    />
  ),
};

/** A channel's vocabulary — same editor, the capability table renames it. */
export const MessageTypes: Story = {
  render: () => (
    <Controlled
      heading="Message types"
      allowedKinds={['command', 'event']}
      initial={[{ name: 'OrderPlaced', kind: 'event' }]}
    />
  ),
};

/** Two rows sharing a name — the inline guard for the API's 422. */
export const DuplicateNames: Story = {
  render: () => (
    <Controlled
      heading="Operations"
      allowedKinds={['command', 'query']}
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
      heading="Operations"
      allowedKinds={['command', 'query']}
      initial={Array.from({ length: NODE_MAX_OPERATIONS }, (_, index) => ({
        name: `operation${index + 1}`,
        kind: 'command' as const,
      }))}
    />
  ),
};
