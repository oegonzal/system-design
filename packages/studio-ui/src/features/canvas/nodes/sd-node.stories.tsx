import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlow } from '@xyflow/react';

import { withReactFlow } from '../../../testing/story-decorators';
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

/** The traffic edge — blues, light to deep as requests move inward. */
export const TrafficGroup: Story = {
  args: {
    nodes: [
      node('n-1', { kind: 'client', label: 'Client' }, { x: 0, y: 0 }),
      node('n-2', { kind: 'cdn', label: 'CDN' }, { x: 220, y: 0 }),
      node('n-3', { kind: 'dns', label: 'DNS' }, { x: 0, y: 90 }),
      node('n-4', { kind: 'gateway', label: 'API Gateway' }, { x: 220, y: 90 }),
      node('n-5', { kind: 'load-balancer', label: 'Load Balancer' }, { x: 110, y: 180 }),
    ],
  },
};

/** Compute — indigo and violet. */
export const ComputeGroup: Story = {
  args: {
    nodes: [
      node('n-1', { kind: 'service', label: 'Order Service' }, { x: 0, y: 0 }),
      node('n-2', { kind: 'worker', label: 'Email Worker' }, { x: 220, y: 0 }),
      node('n-3', { kind: 'scheduler', label: 'Cron' }, { x: 110, y: 90 }),
    ],
  },
};

/** Data at rest — greens and teals. */
export const DataGroup: Story = {
  args: {
    nodes: [
      node(
        'n-1',
        { kind: 'database', label: 'Orders DB', config: { replicas: 2 } },
        { x: 0, y: 0 },
      ),
      node('n-2', { kind: 'replica', label: 'Read Replica' }, { x: 220, y: 0 }),
      node('n-3', { kind: 'object-store', label: 'Media Bucket' }, { x: 0, y: 90 }),
      node('n-4', { kind: 'search-index', label: 'Search' }, { x: 220, y: 90 }),
    ],
  },
};

/** Caches and messaging — the warm hot path. */
export const MessagingGroup: Story = {
  args: {
    nodes: [
      node(
        'n-1',
        { kind: 'cache', label: 'Hot Cache', config: { strategy: 'cache-aside', ttlSeconds: 60 } },
        { x: 0, y: 0 },
      ),
      node('n-2', { kind: 'queue', label: 'Jobs', config: { dlq: true } }, { x: 220, y: 0 }),
      node('n-3', { kind: 'event-stream', label: 'Order Events' }, { x: 110, y: 90 }),
    ],
  },
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
