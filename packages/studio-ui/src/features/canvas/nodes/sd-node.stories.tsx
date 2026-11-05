import {
  DEFAULT_NODE_LABELS,
  kindsInCategory,
  type ConfigEntry,
  type NodeKind,
  type NodeKindCategoryId,
} from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlow } from '@xyflow/react';

import { withReactFlow } from '../../../testing/story-decorators';
import { SdEdge } from '../edges/sd-edge';
import type { SdEdge as SdEdgeModel, SdNode as SdNodeModel } from '../types';
import { SdNode } from './sd-node';

const nodeTypes = { sd: SdNode };
const edgeTypes = { sd: SdEdge };
const NO_EDGES: SdEdgeModel[] = [];

function node(
  id: string,
  data: SdNodeModel['data'],
  position: { x: number; y: number },
  selected = false,
): SdNodeModel {
  return { id, type: 'sd', position, data, selected };
}

const entries = (record: Record<string, string | number | boolean>): ConfigEntry[] =>
  Object.entries(record).map(([key, value]) => ({ key, value }));

/**
 * Representative labels — and configs where an entry count makes the meta
 * line interesting — for the category catalogs below. Anything not listed
 * renders under its palette default.
 */
const SAMPLES: Partial<Record<NodeKind, { label?: string; config?: ConfigEntry[] }>> = {
  client: { label: 'Web + Mobile' },
  gateway: { config: entries({ rateLimit: true }) },
  'websocket-gateway': { label: 'Live Updates', config: entries({ maxConnections: 50_000 }) },
  service: { label: 'Order Service', config: entries({ replicas: 3 }) },
  'serverless-function': { label: 'Thumbnailer', config: entries({ memoryMb: 512 }) },
  'batch-job': { label: 'Nightly ETL', config: entries({ schedule: '0 2 * * *' }) },
  database: { label: 'Orders DB', config: entries({ replicas: 2 }) },
  'kv-store': { label: 'Session Store', config: entries({ ttlSeconds: 1800 }) },
  'time-series-db': { label: 'Metrics DB', config: entries({ retentionDays: 30 }) },
  'vector-db': { label: 'Embeddings', config: entries({ dimensions: 1536 }) },
  cache: { label: 'Hot Cache', config: entries({ strategy: 'cache-aside', ttlSeconds: 60 }) },
  queue: { label: 'Jobs', config: entries({ dlq: true }) },
  'event-stream': { label: 'Order Events' },
  'pub-sub': { label: 'Order Fan-out', config: entries({ delivery: 'at-least-once' }) },
  'cdc-connector': { label: 'Outbox Relay' },
  'notification-service': { label: 'Notifier' },
  'stream-processor': { label: 'Sales Aggregator', config: entries({ parallelism: 4 }) },
  'data-warehouse': { label: 'BI Warehouse' },
  'data-lake': { label: 'Raw Events' },
  'ml-inference': { label: 'Recs Model', config: entries({ gpu: true, timeoutMs: 250 }) },
  scheduler: { label: 'Cron' },
  'workflow-engine': { label: 'Checkout Saga' },
  'distributed-lock': { label: 'Job Lock', config: entries({ ttlSeconds: 30 }) },
  'id-generator': { config: entries({ strategy: 'snowflake' }) },
  'auth-service': { label: 'Identity', config: entries({ tokenType: 'jwt', mfa: true }) },
  waf: { config: entries({ mode: 'block' }) },
  monitoring: { config: entries({ alerting: true }) },
  tracing: { config: entries({ sampling: 10 }) },
  'payment-provider': { label: 'Card Processor', config: entries({ idempotencyKeys: true }) },
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
function NodesPreview({
  nodes,
  edges = NO_EDGES,
}: {
  nodes: SdNodeModel[];
  edges?: SdEdgeModel[];
}) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
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

/** Plum — the observability shelf: watching, never a traffic hop. */
export const ObservabilityCategory: Story = {
  args: { nodes: categoryNodes('observability') },
};

/** Neutral gray — the actors the design doesn't own. */
export const ExternalCategory: Story = {
  args: { nodes: categoryNodes('external') },
};

/** Blocks that are platform services: the role's glyph and colour, the service named on the meta line. */
export const WithPlatformService: Story = {
  args: {
    nodes: [
      node(
        'p-1',
        { kind: 'gateway', service: 'aws.api-gateway', label: 'Orders API' },
        { x: 0, y: 0 },
      ),
      node(
        'p-2',
        { kind: 'serverless-function', service: 'aws.lambda', label: 'Place order' },
        { x: 260, y: 0 },
      ),
      node(
        'p-3',
        {
          kind: 'queue',
          service: 'aws.sqs',
          label: 'Order events',
          config: entries({ queueType: 'fifo' }),
        },
        { x: 0, y: 120 },
      ),
      node(
        'p-4',
        { kind: 'kv-store', service: 'aws.dynamodb', label: 'Orders' },
        { x: 260, y: 120 },
      ),
    ],
  },
};

/** The focus ring — theme border.focus, not a React Flow default. */
export const Selected: Story = {
  args: {
    nodes: [node('n-1', { kind: 'service', label: 'Order Service' }, { x: 60, y: 60 }, true)],
  },
};

/** Declared interfaces on the meta line: ops, roles and config for a service; an event on a queue. */
export const WithDeclaredInterface: Story = {
  args: {
    nodes: [
      node(
        'n-1',
        {
          kind: 'service',
          label: 'Order Service',
          operations: [
            { name: 'placeOrder', kind: 'command' },
            { name: 'getOrder', kind: 'query', idempotent: true },
          ],
          responsibilities: ['Owns the order lifecycle', 'Publishes order events'],
          config: entries({ replicas: 3 }),
        },
        { x: 0, y: 0 },
      ),
      node(
        'n-2',
        {
          kind: 'queue',
          label: 'Order Queue',
          operations: [{ name: 'OrderPlaced', kind: 'event' }],
        },
        { x: 230, y: 0 },
      ),
    ],
  },
};

/** A call edge showing what it carries — the pill lists the first three, then +N. */
export const WithCarriesPill: Story = {
  args: {
    nodes: [
      node('n-1', { kind: 'client', label: 'Client' }, { x: 60, y: 0 }),
      node(
        'n-2',
        {
          kind: 'service',
          label: 'Order Service',
          operations: [
            { name: 'placeOrder', kind: 'command' },
            { name: 'getOrder', kind: 'query' },
            { name: 'cancelOrder', kind: 'command' },
            { name: 'listOrders', kind: 'query' },
          ],
        },
        { x: 60, y: 180 },
      ),
    ],
    edges: [
      {
        id: 'e-1',
        type: 'sd',
        source: 'n-1',
        target: 'n-2',
        data: {
          kind: 'sync',
          carries: ['placeOrder', 'getOrder', 'cancelOrder', 'listOrders'],
        },
      },
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
