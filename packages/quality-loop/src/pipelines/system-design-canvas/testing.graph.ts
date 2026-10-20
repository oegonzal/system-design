/**
 * The sample canvas the order-history fixture draws: a storefront pushing
 * webhooks, a point-of-sale system polled on a schedule, an owned read model
 * behind a queue and an idempotent indexer. Pure data — no vitest imports —
 * so it compiles under the app tsconfig beside `testing.ts`, which binds and
 * narrates it.
 */
import type { CanvasGraph } from '@sysdesign/contracts';

export const sampleGraph = (): CanvasGraph => ({
  nodes: [
    { id: 'client-1', kind: 'client', label: 'Shopper', position: { x: 0, y: 200 } },
    {
      id: 'gateway-1',
      kind: 'gateway',
      label: 'API gateway',
      config: [
        { key: 'authMode', value: 'jwt' },
        { key: 'rateLimit', value: true },
      ],
      position: { x: 240, y: 200 },
    },
    {
      id: 'service-1',
      kind: 'service',
      label: 'History service',
      config: [
        { key: 'replicas', value: 4 },
        { key: 'rpsPerInstance', value: 500 },
        { key: 'autoscaling', value: true },
      ],
      responsibilities: ['serves the order history read model'],
      operations: [
        { name: 'listOrders', kind: 'query' },
        { name: 'getOrder', kind: 'query' },
        { name: 'getSpendSummary', kind: 'query' },
        { name: 'resyncCustomer', kind: 'command', idempotent: true },
      ],
      position: { x: 500, y: 200 },
    },
    {
      id: 'service-2',
      kind: 'service',
      label: 'Webhook receiver',
      config: [
        { key: 'replicas', value: 2 },
        { key: 'idempotent', value: true },
      ],
      operations: [{ name: 'receiveStorefrontWebhook', kind: 'command', idempotent: true }],
      position: { x: 240, y: -40 },
    },
    {
      id: 'batch-job-1',
      kind: 'batch-job',
      label: 'POS importer',
      config: [
        { key: 'pollIntervalSeconds', value: 120 },
        { key: 'idempotent', value: true },
      ],
      operations: [{ name: 'importPosOrders', kind: 'command', idempotent: true }],
      position: { x: 240, y: 440 },
    },
    {
      id: 'queue-1',
      kind: 'queue',
      label: 'Orders queue',
      config: [
        { key: 'delivery', value: 'at-least-once' },
        { key: 'ordering', value: 'per-key' },
        { key: 'dlq', value: true },
        { key: 'maxRetries', value: 5 },
      ],
      operations: [
        { name: 'OrderReceivedOnline', kind: 'event' },
        { name: 'OrderReceivedOffline', kind: 'event' },
        { name: 'OrderRefunded', kind: 'event' },
      ],
      position: { x: 500, y: 40 },
    },
    {
      id: 'worker-1',
      kind: 'worker',
      label: 'Order indexer',
      config: [
        { key: 'replicas', value: 2 },
        { key: 'idempotent', value: true },
      ],
      operations: [{ name: 'ingestIndex', kind: 'command', idempotent: true }],
      position: { x: 760, y: 40 },
    },
    {
      id: 'event-stream-1',
      kind: 'event-stream',
      label: 'Order events',
      config: [
        { key: 'partitions', value: 12 },
        { key: 'partitionKey', value: 'customer_id' },
        { key: 'retentionHours', value: 168 },
        { key: 'delivery', value: 'at-least-once' },
      ],
      operations: [
        { name: 'OrderIndexed', kind: 'event' },
        { name: 'IngestFailed', kind: 'event' },
      ],
      position: { x: 1020, y: 40 },
    },
    {
      id: 'stream-processor-1',
      kind: 'stream-processor',
      label: 'Spend aggregator',
      config: [
        { key: 'parallelism', value: 4 },
        { key: 'checkpointing', value: true },
      ],
      position: { x: 1280, y: 120 },
    },
    {
      id: 'notification-service-1',
      kind: 'notification-service',
      label: 'Ops alerts',
      position: { x: 1280, y: -40 },
    },
    {
      id: 'database-1',
      kind: 'database',
      label: 'Order history DB',
      config: [
        { key: 'consistency', value: 'strong' },
        { key: 'sharding', value: 'hash' },
        { key: 'partitionKey', value: 'customer_id' },
        { key: 'replicas', value: 2 },
        { key: 'backups', value: true },
      ],
      position: { x: 760, y: 320 },
    },
    {
      id: 'external-1',
      kind: 'external-api',
      label: 'Online storefront',
      config: [
        { key: 'webhooks', value: true },
        { key: 'timeoutMs', value: 2000 },
        { key: 'circuitBreaker', value: true },
      ],
      position: { x: 0, y: -40 },
    },
    {
      id: 'external-2',
      kind: 'external-api',
      label: 'Retail POS',
      config: [
        { key: 'timeoutMs', value: 3000 },
        { key: 'retries', value: 2 },
        { key: 'circuitBreaker', value: true },
      ],
      position: { x: 0, y: 440 },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'client-1', target: 'gateway-1', kind: 'sync' },
    {
      id: 'edge-2',
      source: 'gateway-1',
      target: 'service-1',
      kind: 'sync',
      carries: ['listOrders', 'getOrder', 'getSpendSummary', 'resyncCustomer'],
    },
    { id: 'edge-3', source: 'service-1', target: 'database-1', kind: 'sync', label: 'read' },
    {
      id: 'edge-4',
      source: 'external-1',
      target: 'service-2',
      kind: 'async',
      carries: ['receiveStorefrontWebhook'],
    },
    {
      id: 'edge-5',
      source: 'service-2',
      target: 'queue-1',
      kind: 'async',
      carries: ['OrderReceivedOnline', 'OrderRefunded'],
    },
    { id: 'edge-6', source: 'batch-job-1', target: 'external-2', kind: 'sync', label: 'poll' },
    {
      id: 'edge-7',
      source: 'batch-job-1',
      target: 'queue-1',
      kind: 'async',
      carries: ['OrderReceivedOffline'],
    },
    {
      id: 'edge-8',
      source: 'queue-1',
      target: 'worker-1',
      kind: 'async',
      carries: ['OrderReceivedOnline', 'OrderReceivedOffline', 'OrderRefunded'],
    },
    { id: 'edge-9', source: 'worker-1', target: 'database-1', kind: 'sync', label: 'write' },
    {
      id: 'edge-10',
      source: 'worker-1',
      target: 'event-stream-1',
      kind: 'async',
      carries: ['OrderIndexed', 'IngestFailed'],
    },
    {
      id: 'edge-11',
      source: 'event-stream-1',
      target: 'stream-processor-1',
      kind: 'async',
      carries: ['OrderIndexed'],
    },
    {
      id: 'edge-12',
      source: 'event-stream-1',
      target: 'notification-service-1',
      kind: 'async',
      carries: ['IngestFailed'],
    },
    {
      id: 'edge-13',
      source: 'stream-processor-1',
      target: 'database-1',
      kind: 'sync',
      label: 'write',
    },
  ],
});
