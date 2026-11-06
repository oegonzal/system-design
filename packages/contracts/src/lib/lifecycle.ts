import { DEFAULT_NODE_LABELS, type EDGE_CONFIG_HINTS, type NodeKind } from './canvas';
import type { CanvasGraph } from './canvas.schema';
import type { PlatformCatalogue, PlatformService } from './platforms/service';

/**
 * The request lifecycle: what a request that enters from outside passes
 * before the design's own parts take it — declared once, as data, and
 * platform-neutral. A stage is served by a block of one of its roles or by a
 * hop declaring one of its keys; an entry is the role of the block a path
 * begins at and names the stages that path shows; a resting role is where a
 * request comes to rest. The goal section, the pipeline's render and
 * validator and the studio's tracer all read these tables and nothing else —
 * so the same fact is stated to the author, the lenses and the coach.
 */
type EdgeConfigHint = (typeof EDGE_CONFIG_HINTS)[number];

export interface LifecycleStage {
  readonly id: string;
  readonly label: string;
  /** What the stage is, present tense, one sentence (≤ 160 chars, like the node guide). */
  readonly what: string;
  /** The roles a block serving the stage plays. */
  readonly roles: readonly NodeKind[];
  /**
   * Where that block lies: a request passes through the access layer and the
   * edge cache, so their blocks are on the path; a resolver, a certificate, a
   * firewall or an authorizer serves the block it is joined to, so it may lie
   * beside the path as well as on it.
   */
  readonly where: 'on-path' | 'on-or-beside';
  /** The config keys a hop serving the stage declares. */
  readonly hopKeys: readonly EdgeConfigHint[];
}

export const LIFECYCLE_STAGES = [
  {
    id: 'name-resolution',
    label: 'name resolution',
    what: "The client turns the system's name into an address: the first hop, before any of the design's own parts.",
    roles: ['dns'],
    where: 'on-or-beside',
    hopKeys: [],
  },
  {
    id: 'transport-security',
    label: 'transport security',
    what: 'Where TLS ends and which certificate the endpoint presents, so nothing between the client and the edge reads the request.',
    roles: ['certificate-manager'],
    where: 'on-or-beside',
    hopKeys: ['tls'],
  },
  {
    id: 'edge-delivery',
    label: 'edge delivery',
    what: 'Static and cacheable responses served from the edge, near the client and off the origin.',
    roles: ['cdn'],
    where: 'on-path',
    hopKeys: [],
  },
  {
    id: 'edge-protection',
    label: 'edge protection',
    what: 'What filters, rate-limits and blocks hostile traffic before anything is admitted.',
    roles: ['waf'],
    where: 'on-or-beside',
    hopKeys: [],
  },
  {
    id: 'ingress',
    label: 'the access layer',
    what: 'The front door that admits and routes the request: a gateway, a load balancer, a realtime gateway or a service network.',
    roles: ['gateway', 'websocket-gateway', 'load-balancer', 'service-mesh'],
    where: 'on-path',
    hopKeys: [],
  },
  {
    id: 'identity',
    label: 'identity',
    what: 'How the caller obtains credentials or tokens, how each hop verifies them, and what decides what the caller may do.',
    roles: ['auth-service', 'authorization-service'],
    where: 'on-or-beside',
    hopKeys: ['auth'],
  },
] as const satisfies readonly LifecycleStage[];

export type LifecycleStageId = (typeof LIFECYCLE_STAGES)[number]['id'];

export interface RequestEntry {
  readonly id: string;
  readonly label: string;
  /** The roles a path begins at when a request enters this way. */
  readonly roles: readonly NodeKind[];
  /** The stages every path of this entry shows. */
  readonly stages: readonly LifecycleStageId[];
  /** Stages the goal names as conditional for this entry; never reported absent. */
  readonly conditional: readonly LifecycleStageId[];
}

const WAY_IN = [
  'name-resolution',
  'transport-security',
  'edge-protection',
  'ingress',
  'identity',
] as const satisfies readonly LifecycleStageId[];

export const REQUEST_ENTRIES = [
  {
    id: 'client',
    label: 'a client',
    roles: ['client', 'actor'],
    stages: WAY_IN,
    conditional: ['edge-delivery'],
  },
  {
    id: 'partner',
    label: 'a partner system',
    roles: ['external-api', 'payment-provider'],
    stages: WAY_IN,
    conditional: [],
  },
  {
    id: 'inside',
    label: 'inside the system',
    roles: [
      'scheduler',
      'workflow-engine',
      'batch-job',
      'queue',
      'event-stream',
      'pub-sub',
      'cdc-connector',
    ],
    stages: [],
    conditional: [],
  },
] as const satisfies readonly RequestEntry[];

/** The roles a request comes to rest at: where its effect lands, or where it leaves the system. */
export const REST_ROLES = [
  'database',
  'replica',
  'object-store',
  'search-index',
  'kv-store',
  'time-series-db',
  'vector-db',
  'file-store',
  'cache',
  'data-warehouse',
  'data-lake',
  'queue',
  'event-stream',
  'pub-sub',
  'notification-service',
  'external-api',
  'payment-provider',
  'client',
  'actor',
  'static-site-host',
  'ml-inference',
  'monitoring',
  'logging',
  'tracing',
] as const satisfies readonly NodeKind[];

export const requestEntryOf = (kind: NodeKind): RequestEntry | null =>
  REQUEST_ENTRIES.find((entry) => (entry.roles as readonly NodeKind[]).includes(kind)) ?? null;

export const isRestRole = (kind: NodeKind): boolean =>
  (REST_ROLES as readonly NodeKind[]).includes(kind);

/** The catalogue services that play a role serving the stage — by role, never by id. */
export const servicesForStage = (
  catalogue: PlatformCatalogue,
  stage: LifecycleStage,
): PlatformService[] =>
  catalogue.services.filter((service) => service.roles.some((role) => stage.roles.includes(role)));

export type StageCoverage =
  | { readonly by: 'node'; readonly nodeId: string; readonly beside: string | null }
  | { readonly by: 'hop'; readonly edgeId: string; readonly key: string };

export interface TracedStage {
  readonly stage: LifecycleStage;
  readonly conditional: boolean;
  readonly covered: StageCoverage | null;
}

/** What one traced path declares: where it enters, the stages it shows, and where it comes to rest. */
export interface PathTracing {
  readonly entry: RequestEntry | null;
  readonly firstNodeId: string | null;
  readonly stages: readonly TracedStage[];
  readonly rest: {
    readonly nodeId: string;
    readonly kind: NodeKind;
    readonly atRest: boolean;
  } | null;
}

/** The node ids a path walks, in order, stopping where the walk breaks or names an edge that is not there. */
export function walkOf(graph: CanvasGraph, path: readonly string[]): string[] {
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const walk: string[] = [];
  for (const edgeId of path) {
    const edge = edgeById.get(edgeId);
    if (edge === undefined) break;
    if (walk.length === 0) walk.push(edge.source);
    else if (walk[walk.length - 1] !== edge.source) break;
    walk.push(edge.target);
  }
  return walk;
}

export function pathStages(graph: CanvasGraph, path: readonly string[]): PathTracing {
  const walk = walkOf(graph, path);
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const first = walk[0];
  const firstKind = first === undefined ? undefined : kindOf.get(first);
  if (first === undefined || firstKind === undefined) {
    return { entry: null, firstNodeId: first ?? null, stages: [], rest: null };
  }
  const entry = requestEntryOf(firstKind);
  const last = walk[walk.length - 1];
  const lastKind = last === undefined ? undefined : kindOf.get(last);
  const rest =
    last === undefined || lastKind === undefined
      ? null
      : { nodeId: last, kind: lastKind, atRest: isRestRole(lastKind) };
  if (entry === null || (entry.stages.length === 0 && entry.conditional.length === 0)) {
    return { entry, firstNodeId: first, stages: [], rest };
  }
  const onWalk = new Set(walk);
  const walkEdges = new Set(path.slice(0, Math.max(walk.length - 1, 0)));
  const covering = (stage: LifecycleStage): StageCoverage | null => {
    const serves = (nodeId: string) => {
      const kind = kindOf.get(nodeId);
      return kind !== undefined && stage.roles.includes(kind);
    };
    const onPath = walk.find(serves);
    if (onPath !== undefined) return { by: 'node', nodeId: onPath, beside: null };
    for (const edge of stage.where === 'on-or-beside' ? graph.edges : []) {
      if (onWalk.has(edge.source) && !onWalk.has(edge.target) && serves(edge.target)) {
        return { by: 'node', nodeId: edge.target, beside: edge.source };
      }
      if (onWalk.has(edge.target) && !onWalk.has(edge.source) && serves(edge.source)) {
        return { by: 'node', nodeId: edge.source, beside: edge.target };
      }
    }
    for (const edge of graph.edges) {
      if (!walkEdges.has(edge.id)) continue;
      const entryFound = (edge.config ?? []).find((item) =>
        (stage.hopKeys as readonly string[]).includes(item.key),
      );
      if (entryFound !== undefined) return { by: 'hop', edgeId: edge.id, key: entryFound.key };
    }
    return null;
  };
  const wanted = new Set<string>([...entry.stages, ...entry.conditional]);
  const stages = LIFECYCLE_STAGES.filter((stage) => wanted.has(stage.id)).map((stage) => ({
    stage,
    conditional: (entry.conditional as readonly string[]).includes(stage.id),
    covered: covering(stage),
  }));
  return { entry, firstNodeId: first, stages, rest };
}

export type NodeReach = 'on-path' | 'beside-path' | 'untraced';

export interface ReachOfNode {
  readonly nodeId: string;
  readonly kind: NodeKind;
  readonly reach: NodeReach;
  /** Whether any binding names the node, traced or not. */
  readonly bound: boolean;
}

/** How every component of the graph is reached by the brief's traced paths, in graph order. */
export function nodeReach(
  graph: CanvasGraph,
  bindings: readonly { readonly nodeIds: readonly string[]; readonly path?: readonly string[] }[],
): ReachOfNode[] {
  const onPath = new Set<string>();
  for (const binding of bindings)
    for (const id of walkOf(graph, binding.path ?? [])) onPath.add(id);
  const beside = new Set<string>();
  for (const edge of graph.edges) {
    if (onPath.has(edge.source) && !onPath.has(edge.target)) beside.add(edge.target);
    if (onPath.has(edge.target) && !onPath.has(edge.source)) beside.add(edge.source);
  }
  const bound = new Set(bindings.flatMap((binding) => [...binding.nodeIds]));
  return graph.nodes.map((node) => ({
    nodeId: node.id,
    kind: node.kind,
    reach: onPath.has(node.id) ? 'on-path' : beside.has(node.id) ? 'beside-path' : 'untraced',
    bound: bound.has(node.id),
  }));
}

export const LIFECYCLE_SECTION_HEADING = '## Request lifecycle';

/** Roles as the palette names them, lower-cased and comma-joined: `dns`, `certificate manager`. */
export const roleNames = (roles: readonly NodeKind[]): string =>
  roles.map((role) => DEFAULT_NODE_LABELS[role].toLowerCase()).join(', ');

const stageNames = (ids: readonly LifecycleStageId[]): string =>
  LIFECYCLE_STAGES.filter((stage) => (ids as readonly string[]).includes(stage.id))
    .map((stage) => stage.label)
    .join(', ');

/**
 * The lifecycle as a section of a grading goal, so every lens reads the same
 * declared facts the canvas showed the author: where a request enters, the
 * stages its way in shows and what serves each, and where it comes to rest.
 * On a platform, each stage names the catalogue services that play its roles.
 */
export function renderLifecycleSection(catalogue: PlatformCatalogue | null): string {
  const lines = [
    LIFECYCLE_SECTION_HEADING,
    '',
    "A request that enters from outside the system has a complete way in. A binding's path begins at the block where the request enters; that block's role names the stages the path shows, each served by a block of a listed role — on the path, or beside it (joined by an edge to a block on the path) where the stage says so — or by a hop on the path declaring a listed key; or the design says why a stage is absent. Every traced path comes to rest at a block of a resting role, and every component drawn lies on or beside a traced path.",
    '',
    '### Entries',
    '',
  ];
  for (const entry of REQUEST_ENTRIES) {
    const stages = entry.stages.length === 0 ? 'no way in to show' : stageNames(entry.stages);
    const conditional =
      entry.conditional.length === 0
        ? ''
        : `; ${stageNames(entry.conditional)} where the response is static or media`;
    lines.push(`- ${entry.label} (${roleNames(entry.roles)}): ${stages}${conditional}`);
  }
  lines.push('', '### Stages', '');
  for (const stage of LIFECYCLE_STAGES) {
    const where = stage.where === 'on-path' ? 'on the path' : 'on or beside the path';
    const keys = stage.hopKeys.length === 0 ? '' : `; hop keys: ${stage.hopKeys.join(', ')}`;
    const services =
      catalogue === null
        ? ''
        : ` Services: ${servicesForStage(catalogue, stage)
            .map((service) => `\`${service.id}\``)
            .join(', ')}.`;
    lines.push(
      `- ${stage.label} — ${stage.what} Blocks: ${roleNames(stage.roles)} (${where})${keys}.${services}`,
    );
  }
  lines.push('', '### Rest', '', `A request comes to rest at: ${roleNames(REST_ROLES)}.`);
  return lines.join('\n');
}
