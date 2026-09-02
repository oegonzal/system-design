import { NODE_MAX_OPERATIONS, type NodeOperation } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { makeWorkflowSpec } from '../../../testing/fixtures';
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

/** A workflow prompt in play: rows link to spec contracts and declare emissions. */
export const WithFulfills: Story = {
  render: () => (
    <Controlled
      heading="Operations"
      allowedKinds={['command', 'query']}
      workflow={{ spec: makeWorkflowSpec(), role: 'api' }}
      initial={[
        { name: 'listOrders', kind: 'query', fulfills: 'op-list-orders' },
        {
          name: 'ingestIndex',
          kind: 'command',
          fulfills: 'op-ingest-index',
          emits: ['evt-order-indexed'],
        },
      ]}
    />
  ),
};

/** A channel's message types linking to the spec's domain events. */
export const ChannelEventTransport: Story = {
  render: () => (
    <Controlled
      heading="Message types"
      allowedKinds={['command', 'event']}
      workflow={{ spec: makeWorkflowSpec(), role: 'channel' }}
      initial={[{ name: 'OrderReceived', kind: 'event', fulfills: 'evt-order-received' }]}
    />
  ),
};

/** A kind flipped after its Fulfills pick — warned, never silently cleared. */
export const FulfillsKindMismatch: Story = {
  render: () => (
    <Controlled
      heading="Operations"
      allowedKinds={['command', 'query']}
      workflow={{ spec: makeWorkflowSpec(), role: 'api' }}
      initial={[{ name: 'ingest', kind: 'query', fulfills: 'op-ingest-index' }]}
    />
  ),
};

/** Emissions at the contract cap: unchecked boxes go inert. */
export const EmitsAtCap: Story = {
  render: () => (
    <Controlled
      heading="Operations"
      allowedKinds={['command', 'query']}
      workflow={{
        spec: makeWorkflowSpec({
          events: [
            { id: 'evt-a', statement: 'A happened' },
            { id: 'evt-b', statement: 'B happened' },
            { id: 'evt-c', statement: 'C happened' },
            { id: 'evt-d', statement: 'D happened' },
            { id: 'evt-e', statement: 'E happened' },
          ],
          entities: [],
          operations: [],
          aggregations: [],
          ingests: [],
        }),
        role: 'api',
      }}
      initial={[{ name: 'do', kind: 'command', emits: ['evt-a', 'evt-b', 'evt-c', 'evt-d'] }]}
    />
  ),
};
