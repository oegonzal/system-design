import {
  kindsInCategory,
  type NodeConfig,
  type NodeKind,
  type NodeKindCategoryId,
} from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlow } from '@xyflow/react';

import { withReactFlow } from '../../../testing/story-decorators';
import { DEFAULT_NODE_LABELS } from '../canvas-store';
import type { SdNode as SdNodeModel } from '../types';
import { SdNode } from './sd-node';

const nodeTypes = { sd: SdNode };

function node(
  id: string,
  data: SdNodeModel['data'],
  position: { x: number; y: number },
  selected = false,
): SdNodeModel {
  return { id, type: 'sd', position, data, selected };
}

/**
 * Representative labels — and configs where a knob count makes the meta line
 * interesting — for the category catalogs below. Anything not listed renders
 * under its palette default.
 */
const SAMPLES: Partial<Record<NodeKind, { label?: string; config?: NodeConfig }>> = {
  client: { label: 'Web + Mobile' },
  gateway: { config: { rateLimit: true } },
  'websocket-gateway': { label: 'Live Updates', config: { maxConnections: 50_000, sticky: true } },
  service: { label: 'Order Service', config: { replicas: 3 } },
  'serverless-function': { label: 'Thumbnailer', config: { memoryMb: 512, timeoutSeconds: 30 } },
  'batch-job': { label: 'Nightly ETL', config: { schedule: '0 2 * * *', idempotent: true } },
  database: { label: 'Orders DB', config: { replicas: 2 } },
  'kv-store': { label: 'Session Store', config: { ttlSeconds: 1800 } },
  'time-series-db': { label: 'Metrics DB', config: { retentionDays: 30 } },
  'vector-db': { label: 'Embeddings', config: { dimensions: 1536 } },
  cache: { label: 'Hot Cache', config: { strategy: 'cache-aside', ttlSeconds: 60 } },
  queue: { label: 'Jobs', config: { dlq: true } },
  'event-stream': { label: 'Order Events' },
  'pub-sub': { label: 'Order Fan-out', config: { delivery: 'at-least-once', fanout: 3 } },
  'cdc-connector': { label: 'Outbox Relay', config: { mode: 'outbox' } },
  'notification-service': { label: 'Notifier', config: { channels: 'push,email' } },
  'stream-processor': { label: 'Sales Aggregator', config: { parallelism: 4 } },
  'data-warehouse': { label: 'BI Warehouse', config: { loadMode: 'batch' } },
  'data-lake': { label: 'Raw Events' },
  'ml-inference': { label: 'Recs Model', config: { gpu: true, timeoutMs: 250 } },
  scheduler: { label: 'Cron' },
  'workflow-engine': { label: 'Checkout Saga', config: { mode: 'orchestration' } },
  'distributed-lock': { label: 'Job Lock', config: { ttlSeconds: 30 } },
  'id-generator': { config: { strategy: 'snowflake' } },
  'auth-service': { label: 'Identity', config: { tokenType: 'jwt', mfa: true } },
  waf: { config: { mode: 'block' } },
  monitoring: { config: { alerting: true } },
  tracing: { config: { sampling: 10 } },
  'payment-provider': { label: 'Card Processor', config: { idempotencyKeys: true } },
};

/**
 * Every kind on one shelf, laid out two abreast. Driven by
 * `kindsInCategory()`, so a kind added to the contract joins its category's
 * story — and the smoke harness's axe gate — with no edit here.
 */
function categoryNodes(id: NodeKindCategoryId): SdNodeModel[] {
  return kindsInCategory(id).map((kind, index) => {
    const sample = SAMPLES[kind];
    return node(
      `n-${index + 1}`,
      {
        kind,
        label: sample?.label ?? DEFAULT_NODE_LABELS[kind],
        ...(sample?.config ? { config: sample.config } : {}),
      },
      { x: (index % 2) * 230, y: Math.floor(index / 2) * 90 },
    );
  });
}

/**
 * Static React Flow canvas rendering the given nodes — no interactions.
 *
 * Attribution is hidden here and only here: the catalog's subject is our
 * node component, and the vendor watermark's 10px grey link fails the smoke
 * harness's axe contrast gate. The running app keeps it visible.
 */
function NodesPreview({ nodes }: { nodes: SdNodeModel[] }) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      zoomOnScroll={false}
      panOnDrag={false}
      proOptions={{ hideAttribution: true }}
    />
  );
}

const meta: Meta<typeof NodesPreview> = {
  title: 'Studio/Canvas/SdNode',
  component: NodesPreview,
  decorators: [withReactFlow],
};
export default meta;

type Story = StoryObj<typeof NodesPreview>;

/*
 * One catalog story per contract category — together they render every kind,
 * which makes them the axe gate for each icon-on-chip colour combination.
 */

/** The boundary — light blue where requests originate. */
export const ClientsEdgeCategory: Story = {
  args: { nodes: categoryNodes('clients-edge') },
};

/** Deep blues as requests move inward. */
export const TrafficCategory: Story = {
  args: { nodes: categoryNodes('traffic') },
};

/** Indigo — where the design's own code runs. */
export const ComputeCategory: Story = {
  args: { nodes: categoryNodes('compute') },
};

/** Greens — data at rest. */
export const DataStoresCategory: Story = {
  args: { nodes: categoryNodes('data-stores') },
};

/** Warm amber — the hot path. */
export const CachingCategory: Story = {
  args: { nodes: categoryNodes('caching') },
};

/** Orange — fire-and-forget in flight. */
export const MessagingCategory: Story = {
  args: { nodes: categoryNodes('messaging') },
};

/** Teal — derived data and models. */
export const AnalyticsCategory: Story = {
  args: { nodes: categoryNodes('analytics') },
};

/** Purple — the components that keep the others agreeing. */
export const CoordinationCategory: Story = {
  args: { nodes: categoryNodes('coordination') },
};

/** Crimson — identity and the trust boundary. */
export const SecurityCategory: Story = {
  args: { nodes: categoryNodes('security') },
};

/** Plum — the annotation shelf: watching, never a traffic hop. */
export const ObservabilityCategory: Story = {
  args: { nodes: categoryNodes('observability') },
};

/** Neutral gray — the actors the design doesn't own. */
export const ExternalCategory: Story = {
  args: { nodes: categoryNodes('external') },
};

/** The focus ring — theme border.focus, not a React Flow default. */
export const Selected: Story = {
  args: {
    nodes: [node('n-1', { kind: 'service', label: 'Order Service' }, { x: 60, y: 60 }, true)],
  },
};

/** A suggestion overlay element: dashed, 60% opacity. */
export const Ghost: Story = {
  args: {
    nodes: [
      node('n-1', { kind: 'database', label: 'Orders DB' }, { x: 0, y: 40 }),
      node(
        'suggested-replica-1',
        { kind: 'replica', label: 'Read Replica', ghost: true },
        { x: 220, y: 40 },
      ),
    ],
  },
};

/** A finding pointing at this node — severity-colored outline. */
export const WithSeverity: Story = {
  args: {
    nodes: [
      node('n-1', { kind: 'database', label: 'Orders DB', severity: 'critical' }, { x: 0, y: 0 }),
      node('n-2', { kind: 'queue', label: 'Jobs', severity: 'medium' }, { x: 220, y: 0 }),
      node('n-3', { kind: 'cache', label: 'Cache', severity: 'info' }, { x: 110, y: 90 }),
    ],
  },
};
