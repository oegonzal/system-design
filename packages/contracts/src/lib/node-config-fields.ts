/**
 * The config-knob vocabulary, as data: which knobs each node kind offers, with
 * the control shape and the domain of each. ONE declaration read by everyone
 * who has an opinion about a knob — the properties panel renders from it, the
 * drift gate (`tooling/config-knobs.spec.ts`) checks it against the scoring
 * path, the interface suggester enum-locks proposals to it, and the graph
 * validator rejects a key or value outside it. The keys are the canonical
 * vocabulary the eval rules read verbatim, so a knob renamed here silently
 * un-grades a rule; the drift gate is what makes that loud.
 *
 * `satisfies`-gated over every NodeKind, like NODE_KIND_GUIDE and
 * INTERFACE_CAPABILITIES: a new kind cannot ship without deciding its knobs,
 * even if the decision is "none".
 */
import type { CanvasGraph, NodeConfig, NodeKind } from './canvas';

export type ConfigFieldInput = 'number' | 'text' | 'select' | 'checkbox';

export interface ConfigFieldSpec {
  key: string;
  label: string;
  input: ConfigFieldInput;
  /** Closed vocabulary for `select` — the first option is the default the editor shows. */
  options?: readonly string[];
  /** Bounds for `number`; `min` defaults to 0 in the editor. */
  min?: number;
  max?: number;
}

const number = (key: string, label: string, bounds: { min?: number; max?: number } = {}) =>
  ({ key, label, input: 'number', ...bounds }) satisfies ConfigFieldSpec;
const text = (key: string, label: string) =>
  ({ key, label, input: 'text' }) satisfies ConfigFieldSpec;
const select = (key: string, label: string, options: readonly string[]) =>
  ({ key, label, input: 'select', options }) satisfies ConfigFieldSpec;
const checkbox = (key: string, label: string) =>
  ({ key, label, input: 'checkbox' }) satisfies ConfigFieldSpec;

/** Delivery guarantees — one vocabulary for queue, event-stream and pub-sub. */
export const DELIVERY_OPTIONS = ['at-least-once', 'at-most-once', 'exactly-once'] as const;
const CONSISTENCY_OPTIONS = ['strong', 'eventual', 'quorum'] as const;
const REPLICAS = number('replicas', 'Replicas', { max: 99 });
const POLL_INTERVAL = number('pollIntervalSeconds', 'Poll interval (seconds)', { min: 1 });

export const NODE_CONFIG_FIELDS = {
  client: [],
  cdn: [],
  dns: [],
  gateway: [
    checkbox('rateLimit', 'Rate limiting'),
    select('authMode', 'Auth mode', ['none', 'jwt', 'api-key']),
    checkbox('admissionControl', 'Admission control'),
  ],
  'load-balancer': [
    checkbox('rateLimit', 'Rate limiting'),
    select('algorithm', 'Algorithm', ['round-robin', 'least-connections', 'ip-hash']),
  ],
  'websocket-gateway': [
    number('maxConnections', 'Max connections'),
    checkbox('sticky', 'Sticky sessions'),
  ],
  'service-mesh': [checkbox('mtls', 'mTLS')],
  service: [
    REPLICAS,
    number('rpsPerInstance', 'Req/s per instance'),
    checkbox('autoscaling', 'Autoscaling'),
    text('region', 'Region'),
    checkbox('idempotent', 'Idempotent'),
  ],
  worker: [
    number('rpsPerInstance', 'Req/s per instance'),
    REPLICAS,
    number('concurrency', 'Concurrency'),
    checkbox('idempotent', 'Idempotent'),
  ],
  'serverless-function': [
    number('memoryMb', 'Memory (MB)'),
    number('timeoutSeconds', 'Timeout (seconds)'),
    number('provisionedConcurrency', 'Provisioned concurrency'),
  ],
  'batch-job': [checkbox('idempotent', 'Idempotent'), POLL_INTERVAL],
  database: [
    REPLICAS,
    select('sharding', 'Sharding', ['none', 'hash', 'range']),
    text('partitionKey', 'Partition key'),
    select('consistency', 'Consistency', CONSISTENCY_OPTIONS),
    text('region', 'Region'),
    checkbox('multiRegion', 'Multi-region'),
    checkbox('backups', 'Backups'),
  ],
  replica: [number('lagToleranceMs', 'Lag tolerance (ms)')],
  'object-store': [checkbox('versioning', 'Versioning')],
  'search-index': [REPLICAS],
  'kv-store': [
    REPLICAS,
    select('consistency', 'Consistency', CONSISTENCY_OPTIONS),
    number('ttlSeconds', 'TTL (seconds)'),
  ],
  'time-series-db': [
    number('retentionDays', 'Retention (days)'),
    checkbox('downsampling', 'Downsampling'),
  ],
  'vector-db': [],
  cache: [
    select('strategy', 'Strategy', ['cache-aside', 'write-through', 'write-back']),
    number('ttlSeconds', 'TTL (seconds)'),
    select('eviction', 'Eviction', ['lru', 'lfu', 'ttl-only']),
    checkbox('invalidation', 'Invalidation'),
  ],
  queue: [
    select('delivery', 'Delivery', DELIVERY_OPTIONS),
    select('ordering', 'Ordering', ['none', 'fifo', 'per-key']),
    checkbox('dlq', 'Dead-letter queue'),
    number('maxRetries', 'Max retries'),
  ],
  'event-stream': [
    number('partitions', 'Partitions'),
    text('partitionKey', 'Partition key'),
    number('retentionHours', 'Retention (hours)'),
    select('delivery', 'Delivery', DELIVERY_OPTIONS),
  ],
  'pub-sub': [
    select('delivery', 'Delivery', DELIVERY_OPTIONS),
    number('fanout', 'Fan-out (subscribers)'),
  ],
  'cdc-connector': [select('mode', 'Mode', ['log-based', 'outbox'])],
  'notification-service': [checkbox('rateLimit', 'Rate limiting')],
  'stream-processor': [
    number('parallelism', 'Parallelism'),
    checkbox('checkpointing', 'Checkpointing'),
  ],
  'data-warehouse': [],
  'data-lake': [],
  'ml-inference': [REPLICAS, number('timeoutMs', 'Timeout (ms)'), checkbox('fallback', 'Fallback')],
  scheduler: [POLL_INTERVAL],
  'workflow-engine': [select('mode', 'Mode', ['orchestration', 'choreography'])],
  'distributed-lock': [number('ttlSeconds', 'TTL (seconds)')],
  'id-generator': [select('strategy', 'Strategy', ['snowflake', 'uuid', 'ticket'])],
  'config-service': [checkbox('dynamic', 'Dynamic updates')],
  'auth-service': [select('tokenType', 'Token type', ['jwt', 'opaque']), checkbox('mfa', 'MFA')],
  'secrets-manager': [checkbox('rotation', 'Rotation')],
  waf: [select('mode', 'Mode', ['block', 'monitor'])],
  monitoring: [checkbox('alerting', 'Alerting')],
  logging: [number('retentionDays', 'Retention (days)')],
  tracing: [number('sampling', 'Sampling (%)', { max: 100 })],
  'external-api': [
    number('timeoutMs', 'Timeout (ms)'),
    number('retries', 'Retries'),
    checkbox('circuitBreaker', 'Circuit breaker'),
    checkbox('webhooks', 'Webhooks (pushes events)'),
  ],
  'payment-provider': [
    checkbox('idempotencyKeys', 'Idempotency keys'),
    checkbox('webhooks', 'Webhooks'),
  ],
} satisfies Record<NodeKind, readonly ConfigFieldSpec[]>;

export function configFieldsFor(kind: NodeKind): readonly ConfigFieldSpec[] {
  return NODE_CONFIG_FIELDS[kind];
}

/** Every knob key any kind offers — the drift gate's "what the panel writes". */
export function allConfigKeys(): string[] {
  return [
    ...new Set(Object.values(NODE_CONFIG_FIELDS).flatMap((fields) => fields.map((f) => f.key))),
  ];
}

/** Does `value` lie in this field's domain? Type first, then the closed vocabulary or bounds. */
export function isConfigValueInDomain(
  field: ConfigFieldSpec,
  value: string | number | boolean,
): boolean {
  switch (field.input) {
    case 'checkbox':
      return typeof value === 'boolean';
    case 'text':
      return typeof value === 'string';
    case 'select':
      return typeof value === 'string' && (field.options ?? []).includes(value);
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= (field.min ?? 0) &&
        (field.max === undefined || value <= field.max)
      );
  }
}

/**
 * The config a node of this kind may legitimately carry: every key is one the
 * kind offers and every value is in that field's domain. Returns what survives
 * and what was dropped, so a caller can either reject (a hand-crafted payload)
 * or quietly discard (a model proposal) — the impossible/unsupported line, at
 * the config layer.
 */
export function canonicalConfig(
  kind: NodeKind,
  config: NodeConfig,
): { config: NodeConfig; dropped: string[] } {
  const fieldByKey = new Map(configFieldsFor(kind).map((field) => [field.key, field]));
  const kept: NodeConfig = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    const field = fieldByKey.get(key);
    if (field !== undefined && isConfigValueInDomain(field, value)) kept[key] = value;
    else dropped.push(key);
  }
  return { config: kept, dropped };
}

/**
 * A graph with every node's config reduced to its kind's vocabulary — the
 * quiet-discard path (a model proposal, a stored design from before a knob was
 * retired). Nothing the panel could show or the grader could read is lost.
 * Nodes without config, or already canonical, are returned as-is.
 */
export function canonicalizeGraphConfig(graph: CanvasGraph): CanvasGraph {
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (node.config === undefined) return node;
    const { config, dropped } = canonicalConfig(node.kind, node.config);
    if (dropped.length === 0) return node;
    changed = true;
    return { ...node, config };
  });
  return changed ? { ...graph, nodes } : graph;
}

/** Problems for a validator: every off-vocabulary key or out-of-domain value, named. */
export function configVocabularyProblems(graph: CanvasGraph): string[] {
  const problems: string[] = [];
  for (const node of graph.nodes) {
    if (node.config === undefined) continue;
    for (const key of canonicalConfig(node.kind, node.config).dropped) {
      problems.push(`node ${node.id} sets config ${key}, which a ${node.kind} does not offer`);
    }
  }
  return problems;
}
