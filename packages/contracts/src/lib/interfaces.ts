import type { NodeKind, OperationKind } from './canvas';

/**
 * What each node kind's interface *is* — the capability table every layer
 * reads instead of re-deriving it: the UI's editors show or hide the
 * operations section from it, the graph validator counts against it, and
 * `resolveInterfaceOwner` below turns it into the one edge-ownership rule.
 */

/**
 * The five interface roles a kind can play:
 * - `api`        — serves endpoints; its operations are what callers invoke.
 * - `channel`    — carries messages; its operations are the message/event
 *                  types flowing through it, declared once on the channel and
 *                  referenced by both producer and consumer edges.
 * - `storage`    — spoken *to* via a driver/protocol, not an app-level API;
 *                  declares no operations.
 * - `edge-infra` — transparent traffic infrastructure (proxying, filtering,
 *                  resolution); declares no operations of its own.
 * - `passive`    — originates traffic or observes it; declares nothing.
 */
export const INTERFACE_ROLES = ['api', 'channel', 'storage', 'edge-infra', 'passive'] as const;
export type InterfaceRole = (typeof INTERFACE_ROLES)[number];

export interface InterfaceCapability {
  role: InterfaceRole;
  /** Operation kinds this node kind may declare; empty means "declares none". */
  operationKinds: readonly OperationKind[];
  /** Section heading the editor shows for the operations list; null hides it. */
  editorLabel: string | null;
}

const API_LABEL = 'Operations';
const CHANNEL_LABEL = 'Message types';

/**
 * One row per kind — `satisfies Record<NodeKind, ...>` makes a new palette
 * kind refuse to compile until its interface role is filed here.
 */
export const INTERFACE_CAPABILITIES = {
  // ── Clients & Edge
  client: { role: 'passive', operationKinds: [], editorLabel: null },
  cdn: { role: 'edge-infra', operationKinds: [], editorLabel: null },
  dns: { role: 'edge-infra', operationKinds: [], editorLabel: null },
  // ── Traffic & Routing
  gateway: { role: 'api', operationKinds: ['command', 'query'], editorLabel: API_LABEL },
  'load-balancer': { role: 'edge-infra', operationKinds: [], editorLabel: null },
  'websocket-gateway': {
    role: 'api',
    operationKinds: ['command', 'stream'],
    editorLabel: API_LABEL,
  },
  'service-mesh': { role: 'edge-infra', operationKinds: [], editorLabel: null },
  // ── Compute
  service: { role: 'api', operationKinds: ['command', 'query'], editorLabel: API_LABEL },
  worker: { role: 'api', operationKinds: ['command'], editorLabel: API_LABEL },
  'serverless-function': {
    role: 'api',
    operationKinds: ['command', 'query'],
    editorLabel: API_LABEL,
  },
  'batch-job': { role: 'api', operationKinds: ['command'], editorLabel: API_LABEL },
  // ── Data Stores
  database: { role: 'storage', operationKinds: [], editorLabel: null },
  replica: { role: 'storage', operationKinds: [], editorLabel: null },
  'object-store': { role: 'storage', operationKinds: [], editorLabel: null },
  'search-index': { role: 'storage', operationKinds: [], editorLabel: null },
  'kv-store': { role: 'storage', operationKinds: [], editorLabel: null },
  'time-series-db': { role: 'storage', operationKinds: [], editorLabel: null },
  'vector-db': { role: 'storage', operationKinds: [], editorLabel: null },
  // ── Caching
  cache: { role: 'storage', operationKinds: [], editorLabel: null },
  // ── Messaging & Streaming
  queue: { role: 'channel', operationKinds: ['command', 'event'], editorLabel: CHANNEL_LABEL },
  'event-stream': {
    role: 'channel',
    operationKinds: ['event', 'stream'],
    editorLabel: CHANNEL_LABEL,
  },
  'pub-sub': { role: 'channel', operationKinds: ['event'], editorLabel: CHANNEL_LABEL },
  'cdc-connector': { role: 'channel', operationKinds: ['event'], editorLabel: CHANNEL_LABEL },
  'notification-service': { role: 'api', operationKinds: ['command'], editorLabel: API_LABEL },
  // ── Analytics & ML
  'stream-processor': {
    role: 'api',
    operationKinds: ['command', 'stream'],
    editorLabel: API_LABEL,
  },
  'data-warehouse': { role: 'storage', operationKinds: [], editorLabel: null },
  'data-lake': { role: 'storage', operationKinds: [], editorLabel: null },
  'ml-inference': { role: 'api', operationKinds: ['query'], editorLabel: API_LABEL },
  // ── Coordination & Config
  scheduler: { role: 'passive', operationKinds: [], editorLabel: null },
  'workflow-engine': { role: 'api', operationKinds: ['command', 'query'], editorLabel: API_LABEL },
  'distributed-lock': { role: 'api', operationKinds: ['command'], editorLabel: API_LABEL },
  'id-generator': { role: 'api', operationKinds: ['query'], editorLabel: API_LABEL },
  'config-service': { role: 'api', operationKinds: ['query'], editorLabel: API_LABEL },
  // ── Identity & Security
  'auth-service': { role: 'api', operationKinds: ['command', 'query'], editorLabel: API_LABEL },
  'secrets-manager': { role: 'api', operationKinds: ['query'], editorLabel: API_LABEL },
  waf: { role: 'edge-infra', operationKinds: [], editorLabel: null },
  // ── Observability
  monitoring: { role: 'passive', operationKinds: [], editorLabel: null },
  logging: { role: 'passive', operationKinds: [], editorLabel: null },
  tracing: { role: 'passive', operationKinds: [], editorLabel: null },
  // ── External & SaaS
  'external-api': { role: 'api', operationKinds: ['command', 'query'], editorLabel: API_LABEL },
  'payment-provider': {
    role: 'api',
    operationKinds: ['command', 'query'],
    editorLabel: API_LABEL,
  },
} as const satisfies Record<NodeKind, InterfaceCapability>;

/** True when the kind's capability row lists at least one operation kind. */
export function canDeclareOperations(kind: NodeKind): boolean {
  return INTERFACE_CAPABILITIES[kind].operationKinds.length > 0;
}

/**
 * THE edge-ownership rule — the one place that decides whose declared
 * operations an edge's `carries` names resolve against:
 *
 * 1. Target is a channel → 'target' (a produce edge carries the channel's
 *    message types).
 * 2. Else source is a channel → 'source' (a consume edge carries them too).
 * 3. Else the target can declare operations → 'target' (a call edge carries
 *    the callee's endpoints).
 * 4. Else → null: the edge has no operation vocabulary to reference.
 */
export function resolveInterfaceOwner(
  sourceKind: NodeKind,
  targetKind: NodeKind,
): 'source' | 'target' | null {
  if (INTERFACE_CAPABILITIES[targetKind].role === 'channel') return 'target';
  if (INTERFACE_CAPABILITIES[sourceKind].role === 'channel') return 'source';
  if (canDeclareOperations(targetKind)) return 'target';
  return null;
}
