import type { Archetype, PromptDifficulty, WorkflowSpec } from '@sysdesign/contracts';
import { specAtDifficulty } from '@sysdesign/contracts';

/**
 * The business layer per archetype: ONE authored spec with `minDifficulty`
 * markers, filtered per difficulty by `specAtDifficulty` — never drawn from
 * the RNG, so the graded surface is a pure function of (archetype,
 * difficulty) and [GEN-2] seed-reproducibility holds trivially.
 *
 * Only order-history carries one today. The other archetypes return null,
 * which is what keeps the product dimension out of their rubrics — adding a
 * spec to one of them is a deliberate re-grading of that archetype, not a
 * side effect.
 */

/**
 * Authored from the sample assessment this archetype encodes: a storefront
 * pushing order webhooks (≤ 60s to visible), a POS that must be polled
 * (≤ 300s), a normalized per-customer read model, refunds amending visible
 * orders, and — at standard and above — a failure path for ingestion and a
 * spend-summary aggregate fed by the order events.
 *
 * Intro IS the original assessment: list + two ingests + indexing + the
 * order lifecycle. Standard adds amendment, failure and resync. The
 * aggregation joins at standard too, where `analytics` capability prompts
 * start meaning it.
 */
const ORDER_HISTORY_SPEC: WorkflowSpec = {
  version: 1,
  entities: [
    {
      id: 'ent-order',
      name: 'Order (history projection)',
      states: ['received', 'indexed', 'amended'],
      transitions: [
        { from: null, to: 'received', via: 'ing-shopify-webhooks' },
        { from: null, to: 'received', via: 'ing-pos-import' },
        { from: 'received', to: 'indexed', via: 'op-ingest-index' },
        { from: 'indexed', to: 'amended', via: 'evt-order-refunded' },
      ],
    },
  ],
  operations: [
    {
      id: 'op-list-orders',
      kind: 'query',
      statement:
        'Return the authenticated customer’s merged order history, paginated, newest first',
    },
    {
      id: 'op-ingest-index',
      kind: 'command',
      statement:
        'Normalize an incoming order from either source and upsert it into the read model exactly once',
      consumes: ['evt-online-order-received', 'evt-offline-order-received', 'evt-order-refunded'],
      emits: ['evt-order-indexed'],
      onFailureEmits: ['evt-ingest-failed'],
    },
    {
      id: 'op-get-order',
      kind: 'query',
      statement: 'Return one order’s detail — only when it belongs to the authenticated customer',
      minDifficulty: 'standard',
    },
    {
      id: 'op-resync-customer',
      kind: 'command',
      statement: 'Re-sync one customer’s orders from both sources on demand',
      emits: ['evt-order-indexed'],
      minDifficulty: 'standard',
    },
  ],
  events: [
    {
      id: 'evt-online-order-received',
      statement: 'The storefront pushed an order webhook: a new online order arrived',
    },
    {
      id: 'evt-offline-order-received',
      statement: 'The scheduled POS import delivered new in-store orders',
    },
    {
      id: 'evt-order-indexed',
      statement:
        'An order from either source was normalized and became queryable in the read model',
      minDifficulty: 'standard',
    },
    {
      id: 'evt-order-refunded',
      statement: 'A refund was reported for an existing order; its display must change',
      minDifficulty: 'standard',
    },
    {
      id: 'evt-ingest-failed',
      statement:
        'An order failed normalization; it must land where operators can see it, not vanish',
      minDifficulty: 'standard',
    },
  ],
  aggregations: [
    {
      id: 'agg-spend-summary',
      statement: 'A spend summary tile totals the customer’s purchases across both channels',
      sourceEventIds: ['evt-order-indexed', 'evt-order-refunded'],
      minDifficulty: 'standard',
    },
  ],
  ingests: [
    {
      id: 'ing-shopify-webhooks',
      mode: 'push',
      statement:
        'The storefront pushes order webhooks the moment they happen; receive, verify, hand to indexing',
      nfrId: 'ohi-fresh-online',
      emits: ['evt-online-order-received', 'evt-order-refunded'],
    },
    {
      id: 'ing-pos-import',
      mode: 'pull',
      statement:
        'The Retail POS only answers REST queries; poll for new and changed orders on a cadence honouring the five-minute bar',
      nfrId: 'ohi-fresh-offline',
      emits: ['evt-offline-order-received'],
    },
  ],
};

export const WORKFLOW_SPECS = {
  'flash-sale-ticketing': () => null,
  'media-streaming-pipeline': () => null,
  'workflow-automation': () => null,
  'realtime-analytics': () => null,
  'dag-orchestration': () => null,
  'order-history-integration': (difficulty) => specAtDifficulty(ORDER_HISTORY_SPEC, difficulty),
} as const satisfies Record<Archetype, (difficulty: PromptDifficulty) => WorkflowSpec | null>;
