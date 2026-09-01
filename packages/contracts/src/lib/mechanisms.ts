import type { CanvasEdge, CanvasGraph, CanvasNode, NodeConfig, NodeKind } from './canvas';

/**
 * The mechanisms a design can be said to implement, and how the system proves
 * one for itself.
 *
 * This module exists because the previous answer to "did the author explain
 * the design" was a pile of substring tests over prose. Those are deterministic
 * but neither grounded nor universal: they measure a byte sequence rather than
 * a fact, negation is invisible to them, and their extension is whatever
 * happens to be in a hand-written table. A grading predicate should be stable
 * under paraphrase and unstable under falsity; substring predicates are exactly
 * the opposite.
 *
 * So the author binds a requirement to the components that hold it and names
 * the mechanism, and the system CORROBORATES that claim against the graph it
 * already has. Evidence is a set of node ids derived from typed vocabulary —
 * node kinds and the canonical config knobs — so renaming a box, rewording a
 * sentence, or writing in another language changes nothing.
 *
 * One implementation, two callers: the eval engine scores with these, and the
 * brief editor shows the author the same verdict live. They cannot disagree
 * because there is nothing to keep in sync.
 */

/**
 * The graph shape a mechanism predicate needs. Narrow on purpose: the engine
 * satisfies it by wrapping its `GraphIndex` (which already memoizes traversal),
 * and the UI satisfies it with `canvasMechanismGraph` below. Neither has to
 * know about the other.
 */
export interface MechanismGraph {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  /** Directed reachability, following edges source → target. */
  reaches(fromId: string, toId: string): boolean;
}

/** Node ids that demonstrate (or disprove) a mechanism. Sorted and unique. */
export type MechanismEvidence = (graph: MechanismGraph) => string[];

/**
 * Every claim an author may make. Adding one is a compile error until it has
 * an evidence predicate, which is the discipline that keeps the vocabulary
 * from drifting into tokens nothing can verify.
 */
export const MECHANISM_CLAIMS = [
  'rate-limit',
  'authentication',
  'strong-consistency',
  'backups',
  'multi-region',
  'sharding',
  'partitioning',
  'idempotency',
  'dlq',
  'at-least-once',
  'retention',
  'autoscaling',
  'read-cache',
  'read-replica',
  'failover',
  'queue-buffer',
  'cdn-offload',
  'monitoring',
] as const;
export type MechanismClaim = (typeof MECHANISM_CLAIMS)[number];

/* ─── helpers ─────────────────────────────────────────────────────────── */

const ids = (nodes: readonly CanvasNode[]): string[] =>
  [...new Set(nodes.map((node) => node.id))].sort();

const ofKind = (graph: MechanismGraph, ...kinds: NodeKind[]): CanvasNode[] =>
  graph.nodes.filter((node) => kinds.includes(node.kind));

const config = (node: CanvasNode): NodeConfig => node.config ?? {};

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);

/** Nodes of the given kinds whose config satisfies `holds`. */
const declaring = (
  graph: MechanismGraph,
  kinds: readonly NodeKind[],
  holds: (config: NodeConfig, node: CanvasNode) => boolean,
): string[] => ids(graph.nodes.filter((n) => kinds.includes(n.kind) && holds(config(n), n)));

/** Nodes of the given kinds a client can reach — the read-side helpers. */
const clientReachable = (graph: MechanismGraph, kinds: readonly NodeKind[]): CanvasNode[] => {
  const clients = ofKind(graph, 'client');
  return graph.nodes.filter(
    (node) =>
      kinds.includes(node.kind) && clients.some((client) => graph.reaches(client.id, node.id)),
  );
};

const adjacent = (graph: MechanismGraph, nodeId: string): CanvasNode[] => {
  const neighbourIds = new Set(
    graph.edges
      .filter((edge) => edge.source === nodeId || edge.target === nodeId)
      .map((edge) => (edge.source === nodeId ? edge.target : edge.source)),
  );
  return graph.nodes.filter((node) => neighbourIds.has(node.id));
};

const DURABLE_KINDS: readonly NodeKind[] = [
  'database',
  'object-store',
  'data-warehouse',
  'data-lake',
  'time-series-db',
];
const CHANNEL_KINDS: readonly NodeKind[] = ['queue', 'event-stream', 'pub-sub'];
const HANDLER_KINDS: readonly NodeKind[] = [
  'service',
  'worker',
  'batch-job',
  'serverless-function',
];

/* ─── which kinds may carry which claim ───────────────────────────────── */

/**
 * Eligibility, not proof. Binding `dlq` to a client is impossible rather than
 * merely unsupported, so the API rejects it and the editor never offers it —
 * while an eligible-but-unproven binding is graded, never blocked.
 */
export const MECHANISM_KINDS = {
  'rate-limit': ['gateway', 'load-balancer', 'notification-service'],
  authentication: ['gateway', 'auth-service'],
  'strong-consistency': ['database', 'kv-store'],
  backups: ['database'],
  'multi-region': ['database', 'service'],
  sharding: ['database'],
  partitioning: ['event-stream'],
  idempotency: ['service', 'worker', 'batch-job'],
  dlq: ['queue'],
  'at-least-once': ['queue', 'event-stream', 'pub-sub'],
  retention: ['event-stream', 'time-series-db', 'data-lake', 'data-warehouse'],
  autoscaling: ['service', 'worker'],
  'read-cache': ['cache', 'kv-store', 'cdn'],
  'read-replica': ['replica'],
  failover: ['database', 'replica', 'scheduler', 'workflow-engine', 'distributed-lock'],
  'queue-buffer': ['queue', 'event-stream', 'pub-sub'],
  'cdn-offload': ['cdn'],
  monitoring: ['monitoring', 'logging', 'tracing'],
} as const satisfies Record<MechanismClaim, readonly NodeKind[]>;

/* ─── evidence ────────────────────────────────────────────────────────── */

/**
 * How the system proves each mechanism for itself. TOTAL over
 * `MechanismClaim` — a claim with no way to verify it must not be claimable.
 */
export const MECHANISM_EVIDENCE = {
  'rate-limit': (graph) =>
    declaring(graph, MECHANISM_KINDS['rate-limit'], (c) => c['rateLimit'] === true),

  authentication: (graph) => [
    ...declaring(
      graph,
      ['gateway'],
      (c) => typeof c['authMode'] === 'string' && c['authMode'] !== 'none',
    ),
    ...ids(ofKind(graph, 'auth-service')),
  ],

  'strong-consistency': (graph) =>
    declaring(graph, MECHANISM_KINDS['strong-consistency'], (c) => c['consistency'] === 'strong'),

  backups: (graph) => declaring(graph, ['database'], (c) => c['backups'] === true),

  // Either the store replicates across regions itself, or the service/database
  // tier is placed in two or more named regions.
  'multi-region': (graph) => {
    const multiRegion = declaring(graph, ['database'], (c) => c['multiRegion'] === true);
    const placed = graph.nodes.filter(
      (node) =>
        (node.kind === 'service' || node.kind === 'database') &&
        typeof config(node)['region'] === 'string' &&
        String(config(node)['region']).length > 0,
    );
    const regions = new Set(placed.map((node) => String(config(node)['region'])));
    return [...new Set([...multiRegion, ...(regions.size >= 2 ? ids(placed) : [])])].sort();
  },

  sharding: (graph) =>
    declaring(
      graph,
      ['database'],
      (c) => typeof c['sharding'] === 'string' && c['sharding'] !== 'none',
    ),

  partitioning: (graph) =>
    declaring(
      graph,
      ['event-stream'],
      (c) => isNumber(c['partitions']) && Number(c['partitions']) >= 2,
    ),

  // The knob, or the declared interface saying every side effect is safe to replay.
  idempotency: (graph) =>
    ids(
      graph.nodes.filter((node) => {
        if (!MECHANISM_KINDS.idempotency.includes(node.kind as never)) return false;
        if (config(node)['idempotent'] === true) return true;
        const effects = (node.operations ?? []).filter(
          (op) => op.kind === 'command' || op.kind === 'event',
        );
        return effects.length > 0 && effects.every((op) => op.idempotent === true);
      }),
    ),

  // The knob, or a neighbouring queue standing in as the dead-letter target.
  dlq: (graph) =>
    ids(
      ofKind(graph, 'queue').filter(
        (queue) =>
          config(queue)['dlq'] === true ||
          adjacent(graph, queue.id).some((neighbour) => neighbour.kind === 'queue'),
      ),
    ),

  'at-least-once': (graph) =>
    declaring(graph, CHANNEL_KINDS, (c) => c['delivery'] === 'at-least-once'),

  retention: (graph) =>
    declaring(
      graph,
      MECHANISM_KINDS.retention,
      (c) => isNumber(c['retentionHours']) || isNumber(c['retentionDays']),
    ),

  autoscaling: (graph) =>
    declaring(graph, MECHANISM_KINDS.autoscaling, (c) => c['autoscaling'] === true),

  // A cache only counts on the read path: reachable from a client AND in front
  // of something durable, so a cache posing as the system of record is not it.
  'read-cache': (graph) =>
    ids(
      clientReachable(graph, MECHANISM_KINDS['read-cache']).filter((cache) =>
        ofKind(graph, ...DURABLE_KINDS).some((store) => graph.reaches(cache.id, store.id)),
      ),
    ),

  'read-replica': (graph) => ids(clientReachable(graph, ['replica'])),

  // A store with a standby beside it, or an orchestrator with leader election.
  failover: (graph) => {
    const replicated = ofKind(graph, 'database').filter((db) =>
      adjacent(graph, db.id).some((neighbour) => neighbour.kind === 'replica'),
    );
    const replicas = replicated.flatMap((db) =>
      adjacent(graph, db.id).filter((neighbour) => neighbour.kind === 'replica'),
    );
    const orchestrators = ofKind(graph, 'scheduler', 'workflow-engine');
    const locks = ofKind(graph, 'distributed-lock');
    const elected =
      locks.length > 0 || orchestrators.length >= 2 ? [...orchestrators, ...locks] : [];
    return ids([...replicated, ...replicas, ...elected]);
  },

  // A channel is a buffer only when something feeds it and something drains it.
  'queue-buffer': (graph) =>
    ids(
      ofKind(graph, ...CHANNEL_KINDS).filter((channel) => {
        const fed = graph.edges.some(
          (edge) =>
            edge.target === channel.id &&
            graph.nodes.some((n) => n.id === edge.source && !CHANNEL_KINDS.includes(n.kind)),
        );
        const drained = graph.edges.some(
          (edge) =>
            edge.source === channel.id &&
            graph.nodes.some((n) => n.id === edge.target && HANDLER_KINDS.includes(n.kind)),
        );
        return fed && drained;
      }),
    ),

  'cdn-offload': (graph) => ids(clientReachable(graph, ['cdn'])),

  monitoring: (graph) => ids(ofKind(graph, ...MECHANISM_KINDS.monitoring)),
} as const satisfies Record<MechanismClaim, MechanismEvidence>;

/* ─── disproof ────────────────────────────────────────────────────────── */

/**
 * The explicit-false mirror: a node whose own configuration says the mechanism
 * is OFF. Partial by design — absence of disproof is not disproof. That
 * distinction is what separates "nothing backs this claim" (medium) from "the
 * canvas says the opposite" (high).
 */
export const MECHANISM_DISPROOF: Partial<Record<MechanismClaim, MechanismEvidence>> = {
  'rate-limit': (graph) =>
    declaring(graph, MECHANISM_KINDS['rate-limit'], (c) => c['rateLimit'] === false),
  authentication: (graph) => declaring(graph, ['gateway'], (c) => c['authMode'] === 'none'),
  'strong-consistency': (graph) =>
    declaring(graph, MECHANISM_KINDS['strong-consistency'], (c) => c['consistency'] === 'eventual'),
  backups: (graph) => declaring(graph, ['database'], (c) => c['backups'] === false),
  'multi-region': (graph) => declaring(graph, ['database'], (c) => c['multiRegion'] === false),
  sharding: (graph) => declaring(graph, ['database'], (c) => c['sharding'] === 'none'),
  idempotency: (graph) =>
    ids(
      graph.nodes.filter(
        (node) =>
          MECHANISM_KINDS.idempotency.includes(node.kind as never) &&
          (config(node)['idempotent'] === false ||
            (node.operations ?? []).some(
              (op) => (op.kind === 'command' || op.kind === 'event') && op.idempotent === false,
            )),
      ),
    ),
  dlq: (graph) =>
    ids(
      ofKind(graph, 'queue').filter(
        (queue) =>
          config(queue)['dlq'] === false &&
          !adjacent(graph, queue.id).some((neighbour) => neighbour.kind === 'queue'),
      ),
    ),
  'at-least-once': (graph) =>
    declaring(graph, CHANNEL_KINDS, (c) => c['delivery'] === 'at-most-once'),
  autoscaling: (graph) =>
    declaring(graph, MECHANISM_KINDS.autoscaling, (c) => c['autoscaling'] === false),
};

/* ─── adapter for callers holding a plain graph ───────────────────────── */

/**
 * A `MechanismGraph` over a plain `CanvasGraph`, for the editor. Reachability
 * is BFS memoized per source, which is ample for a canvas capped at 100 nodes;
 * the engine passes its own index instead.
 */
export function canvasMechanismGraph(graph: CanvasGraph): MechanismGraph {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const targets = outgoing.get(edge.source);
    if (targets) targets.push(edge.target);
    else outgoing.set(edge.source, [edge.target]);
  }

  const closures = new Map<string, Set<string>>();
  const closureOf = (fromId: string): Set<string> => {
    const cached = closures.get(fromId);
    if (cached) return cached;
    const seen = new Set<string>();
    const queue = [...(outgoing.get(fromId) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(outgoing.get(next) ?? []));
    }
    closures.set(fromId, seen);
    return seen;
  };

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    reaches: (fromId, toId) => closureOf(fromId).has(toId),
  };
}

/* ─── the verdict every consumer shares ───────────────────────────────── */

export interface MechanismVerdict {
  /** Claimed nodes the graph proves. */
  corroborated: string[];
  /** Claimed nodes the graph neither proves nor disproves. */
  uncorroborated: string[];
  /** Claimed nodes whose own config says otherwise. */
  contradicted: string[];
  /** Nodes that demonstrate the mechanism but were never claimed. */
  unclaimed: string[];
}

export function judgeMechanism(
  graph: MechanismGraph,
  mechanism: MechanismClaim,
  nodeIds: readonly string[],
): MechanismVerdict {
  const claimed = new Set(nodeIds);
  const evidence = new Set(MECHANISM_EVIDENCE[mechanism](graph));
  const disproof = new Set(MECHANISM_DISPROOF[mechanism]?.(graph) ?? []);

  return {
    corroborated: [...claimed].filter((id) => evidence.has(id)).sort(),
    contradicted: [...claimed].filter((id) => disproof.has(id)).sort(),
    uncorroborated: [...claimed].filter((id) => !evidence.has(id) && !disproof.has(id)).sort(),
    unclaimed: [...evidence].filter((id) => !claimed.has(id)).sort(),
  };
}
