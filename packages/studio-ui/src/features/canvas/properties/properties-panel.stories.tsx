import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  makeGraph,
  makeInterfaceGraph,
  makeOrderHistoryGraph,
  makeWorkflowSpec,
} from '../../../testing/fixtures';
import { withCanvasStore } from '../../../testing/story-decorators';
import { PropertiesPanel } from './properties-panel';

const meta: Meta<typeof PropertiesPanel> = {
  title: 'Studio/Canvas/PropertiesPanel',
  component: PropertiesPanel,
};
export default meta;

type Story = StoryObj<typeof PropertiesPanel>;

/** Nothing selected — the empty state. */
export const Empty: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};

/**
 * A database selected: label, kind, and the full data-store knob set —
 * replicas, engine, sharding, consistency, region, multi-region, backups.
 */
export const DatabaseSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().select('n-3');
    }),
  ],
};

/** A cache selected: strategy, TTL, eviction and invalidation. */
export const CacheSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().updateNode('n-2', {
        kind: 'cache',
        label: 'Hot Cache',
        config: { strategy: 'cache-aside', ttlSeconds: 60 },
      });
      store.getState().select('n-2');
    }),
  ],
};

/** A queue selected: delivery, ordering, DLQ and retry budget. */
export const QueueSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().updateNode('n-2', {
        kind: 'queue',
        label: 'Jobs',
        config: { delivery: 'at-least-once', ordering: 'per-key', dlq: true, maxRetries: 5 },
      });
      store.getState().select('n-2');
    }),
  ],
};

/** A KV store selected: replicas, consistency and TTL. */
export const KvStoreSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().updateNode('n-3', {
        kind: 'kv-store',
        label: 'Session Store',
        config: { replicas: 3, consistency: 'eventual', ttlSeconds: 1800 },
      });
      store.getState().select('n-3');
    }),
  ],
};

/** An ML inference endpoint selected: replicas, GPU, timeout and fallback. */
export const MlInferenceSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().updateNode('n-2', {
        kind: 'ml-inference',
        label: 'Recs Model',
        config: { replicas: 2, timeoutMs: 250, fallback: true },
      });
      store.getState().select('n-2');
    }),
  ],
};

/** A payment provider selected: idempotency keys and webhooks. */
export const PaymentProviderSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().updateNode('n-3', {
        kind: 'payment-provider',
        label: 'Card Processor',
        config: { idempotencyKeys: true, webhooks: true },
      });
      store.getState().select('n-3');
    }),
  ],
};

/** An edge selected: sync/async toggle and label. */
export const EdgeSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().select('e-2');
    }),
  ],
};

/** A service with the full interface block: responsibilities and Operations. */
export const ServiceInterfaceSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeInterfaceGraph());
      store.getState().select('n-3');
    }),
  ],
};

/** A queue's interface: Message types, no responsibilities. */
export const QueueMessageTypesSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeInterfaceGraph());
      store.getState().select('n-4');
    }),
  ],
};

/** A call edge whose carries resolve against the callee's declared operations. */
export const EdgeCarriesSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeInterfaceGraph());
      store.getState().select('e-2');
    }),
  ],
};

/** A carry the owner never declared: the warning chip and its hint. */
export const EdgeUndeclaredCarrySelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeInterfaceGraph());
      store.getState().updateEdge('e-2', { carries: ['PlaceOrder', 'chargeCard'] });
      store.getState().select('e-2');
    }),
  ],
};

/** A workflow prompt in play: the serving service's ops link to spec contracts. */
export const OrderHistoryServiceSelected: Story = {
  args: { workflowSpec: makeWorkflowSpec() },
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeOrderHistoryGraph());
      store.getState().select('n-3');
    }),
  ],
};

/** The poller's cadence knob — the number the freshness budget is checked against. */
export const SchedulerPollIntervalSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().updateNode('n-2', {
        kind: 'scheduler',
        label: 'POS poll schedule',
        config: { pollIntervalSeconds: 120 },
      });
      store.getState().select('n-2');
    }),
  ],
};

/** An external source marked as pushing webhooks — push-ingest evidence. */
export const ExternalApiWebhooksSelected: Story = {
  args: { workflowSpec: makeWorkflowSpec() },
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeOrderHistoryGraph());
      store.getState().select('n-7');
    }),
  ],
};
