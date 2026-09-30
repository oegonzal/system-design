import type {
  Binding,
  CanvasGraph,
  ComponentRationale,
  CriterionNarration,
  CriterionRef,
  DesignBrief,
  DesignNarrative,
  EdgeKind,
  NodeConfigEntry,
  NodeKind,
  NodeOperation,
  Severity,
} from '@sysdesign/contracts';
import { BINDING_MAX_NODES, reconcileBrief, reconcileNarration } from '@sysdesign/contracts';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { fromCanvasGraph, toCanvasGraph } from './graph-io';
import type { SdEdge, SdNode } from './types';

/** Default label when a kind is dropped from the palette. */
export const DEFAULT_NODE_LABELS = {
  client: 'Client',
  cdn: 'CDN',
  dns: 'DNS',
  gateway: 'API Gateway',
  'load-balancer': 'Load Balancer',
  'websocket-gateway': 'Realtime Gateway',
  'service-mesh': 'Service Mesh',
  service: 'Service',
  worker: 'Worker',
  'serverless-function': 'Serverless Function',
  'batch-job': 'Batch Job',
  database: 'Database',
  replica: 'Read Replica',
  'object-store': 'Object Store',
  'search-index': 'Search Index',
  'kv-store': 'KV Store',
  'time-series-db': 'Time-Series DB',
  'vector-db': 'Vector DB',
  cache: 'Cache',
  queue: 'Queue',
  'event-stream': 'Event Stream',
  'pub-sub': 'Pub/Sub Topic',
  'cdc-connector': 'CDC Connector',
  'notification-service': 'Notification Service',
  'stream-processor': 'Stream Processor',
  'data-warehouse': 'Data Warehouse',
  'data-lake': 'Data Lake',
  'ml-inference': 'ML Inference',
  scheduler: 'Scheduler',
  'workflow-engine': 'Workflow Engine',
  'distributed-lock': 'Distributed Lock',
  'id-generator': 'ID Generator',
  'config-service': 'Config & Flags',
  'auth-service': 'Auth Service',
  'secrets-manager': 'Secrets Manager',
  waf: 'WAF',
  monitoring: 'Monitoring',
  logging: 'Log Aggregation',
  tracing: 'Tracing',
  'external-api': 'External API',
  'payment-provider': 'Payment Provider',
} as const satisfies Record<NodeKind, string>;

export interface HighlightState {
  nodeIds: string[];
  edgeIds: string[];
  severity: Severity;
}

export interface CanvasState {
  nodes: SdNode[];
  edges: SdEdge[];
  selectedId: string | null;
  /** Unsaved-draft flag: set by edits, cleared by setGraph/markClean. */
  dirty: boolean;
  /**
   * The narrative draft submitted alongside the graph — reference-anchored
   * prose held as three slot groups (an overview, a rationale per node id, a
   * narration per criterion id), the shape `serializeNarrative` reconciles
   * into a `DesignNarrative`.
   *
   * Deliberately orthogonal to the graph, exactly as the brief is: `setGraph`
   * never touches these and `serialize` never includes them — loading a
   * revision pairs `setGraph` with `loadNarrative`, and submitting reads both
   * separately. Stale references (a rationale for a deleted node) are tolerated
   * and dropped once, at `serializeNarrative`.
   */
  narrativeOverview: string;
  componentRationales: ComponentRationale[];
  criterionNarrations: CriterionNarration[];
  /**
   * The brief being drafted: at most one binding per criterion, held in the
   * schema's own shape but allowed to be incomplete while it is typed — an
   * empty claim or no component yet. Stale references are tolerated here (a
   * bound node can be deleted afterwards) and resolved once, at
   * `serializeBrief`, because a canvas edit must never silently rewrite what
   * the author wrote.
   */
  bindings: Binding[];
  highlight: HighlightState | null;

  setGraph(graph: CanvasGraph): void;
  addNode(kind: NodeKind, position?: XYPosition): SdNode;
  onNodesChange(changes: NodeChange<SdNode>[]): void;
  onEdgesChange(changes: EdgeChange<SdEdge>[]): void;
  onConnect(connection: Connection): void;
  updateNode(
    id: string,
    patch: {
      label?: string;
      kind?: NodeKind;
      config?: NodeConfigEntry[];
      responsibilities?: string[];
      operations?: NodeOperation[];
    },
  ): void;
  updateEdge(id: string, patch: { kind?: EdgeKind; label?: string; carries?: string[] }): void;
  removeSelected(): void;
  select(id: string | null): void;
  setHighlight(highlight: HighlightState): void;
  clearHighlight(): void;
  /** Author edit — sets the big-picture overview and dirties the draft. */
  setNarrativeOverview(text: string): void;
  /** Author edit — sets one component's rationale; empty prose clears the slot. */
  setComponentRationale(nodeId: string, prose: string): void;
  /** Author edit — sets one criterion's narration; empty prose clears it. */
  setCriterionNarration(criterionId: string, prose: string): void;
  /** Revision load — replaces the narrative draft without touching `dirty`. */
  loadNarrative(narrative: DesignNarrative | null): void;
  /** Author edit — the claim in the author's words; creates the binding on first use. */
  setBindingClaim(criterionId: string, claim: string): void;
  toggleBindingNode(criterionId: string, nodeId: string): void;
  /** Replace the walk for one criterion; an empty path removes it. */
  setBindingPath(criterionId: string, path: string[]): void;
  clearBinding(criterionId: string): void;
  /** Revision load — replaces the brief without touching `dirty`. */
  loadBrief(brief: DesignBrief | null): void;
  markClean(): void;
  markDirty(): void;
  serialize(): CanvasGraph;
  /** The brief as a payload, reconciled against the live graph and rubric, or null. */
  serializeBrief(criteria: readonly CriterionRef[]): DesignBrief | null;
  /** The narrative as a payload, reconciled against the live graph and rubric, or null. */
  serializeNarrative(criteria: readonly CriterionRef[]): DesignNarrative | null;
}

export type CanvasStore = StoreApi<CanvasState>;

/** `n-7` style ids: one past the highest existing suffix, never a collision. */
function nextId(prefix: 'n' | 'e', existing: { id: string }[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const { id } of existing) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let candidate = `${prefix}-${max + 1}`;
  // Belt and braces against non-sequential ids that happen to look sequential.
  while (existing.some(({ id }) => id === candidate)) {
    max += 1;
    candidate = `${prefix}-${max + 1}`;
  }
  return candidate;
}

/** Write highlight severity onto the affected elements' data, null elsewhere. */
function paintSeverity<T extends SdNode | SdEdge>(
  elements: T[],
  ids: Set<string>,
  severity: Severity | null,
): T[] {
  return elements.map((element) => {
    const next = ids.has(element.id) ? severity : null;
    const current = element.data?.severity ?? null;
    if (current === next) return element;
    return { ...element, data: { ...element.data, severity: next } } as T;
  });
}

/** A binding with nothing in it is not kept — the row reads `empty` again. */
function isBlank(binding: Binding): boolean {
  return (
    binding.claim.trim().length === 0 &&
    binding.nodeIds.length === 0 &&
    (binding.path ?? []).length === 0
  );
}

/** Upsert one criterion's binding, dropping it when the edit emptied it. */
function upsert(
  bindings: Binding[],
  criterionId: string,
  patch: (current: Binding) => Binding,
): Binding[] {
  const existing = bindings.find((binding) => binding.criterionId === criterionId);
  const next = patch(existing ?? { criterionId, nodeIds: [], claim: '' });
  const others = bindings.filter((binding) => binding.criterionId !== criterionId);
  if (isBlank(next)) return others;
  return existing
    ? bindings.map((binding) => (binding.criterionId === criterionId ? next : binding))
    : [...others, next];
}

/**
 * A factory, deliberately — no module-level store instance. Each practice
 * workspace mounts its own store, so two sessions in one browser tab
 * lifecycle can never bleed graphs into each other.
 */
export function createCanvasStore(initial?: CanvasGraph): CanvasStore {
  return createStore<CanvasState>()((set, get) => ({
    ...(initial ? fromCanvasGraph(initial) : { nodes: [], edges: [] }),
    selectedId: null,
    dirty: false,
    narrativeOverview: '',
    componentRationales: [],
    criterionNarrations: [],
    bindings: [],
    highlight: null,

    setGraph(graph) {
      const { nodes, edges } = fromCanvasGraph(graph);
      set({ nodes, edges, selectedId: null, dirty: false, highlight: null });
    },

    addNode(kind, position) {
      const { nodes } = get();
      const node: SdNode = {
        id: nextId('n', nodes),
        type: 'sd',
        // Drops give an exact position; keyboard-adds stagger from the count
        // so consecutive adds never stack invisibly on one spot.
        position: position ?? {
          x: 240 + (nodes.length % 5) * 48,
          y: 160 + (nodes.length % 5) * 48,
        },
        data: { kind, label: DEFAULT_NODE_LABELS[kind] },
      };
      set({ nodes: [...nodes, node], selectedId: node.id, dirty: true });
      return node;
    },

    onNodesChange(changes) {
      const { nodes, selectedId } = get();
      const removed = new Set(
        changes.filter((change) => change.type === 'remove').map((change) => change.id),
      );
      const meaningful = changes.some(
        (change) => change.type === 'remove' || change.type === 'position',
      );
      set({
        nodes: applyNodeChanges<SdNode>(changes, nodes),
        ...(meaningful ? { dirty: true } : {}),
        ...(selectedId !== null && removed.has(selectedId) ? { selectedId: null } : {}),
      });
    },

    onEdgesChange(changes) {
      const { edges, selectedId } = get();
      const removed = new Set(
        changes.filter((change) => change.type === 'remove').map((change) => change.id),
      );
      const meaningful = changes.some((change) => change.type === 'remove');
      set({
        edges: applyEdgeChanges<SdEdge>(changes, edges),
        ...(meaningful ? { dirty: true } : {}),
        ...(selectedId !== null && removed.has(selectedId) ? { selectedId: null } : {}),
      });
    },

    onConnect(connection) {
      const { edges } = get();
      if (!connection.source || !connection.target) return;
      // Self-loops model nothing at this altitude; exact duplicates add noise.
      if (connection.source === connection.target) return;
      const duplicate = edges.some(
        (edge) => edge.source === connection.source && edge.target === connection.target,
      );
      if (duplicate) return;

      const edge: SdEdge = {
        id: nextId('e', edges),
        type: 'sd',
        source: connection.source,
        target: connection.target,
        data: { kind: 'sync' },
      };
      set({ edges: [...edges, edge], dirty: true });
    },

    updateNode(id, patch) {
      const { nodes } = get();
      if (!nodes.some((node) => node.id === id)) return;
      set({
        nodes: nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
        dirty: true,
      });
    },

    updateEdge(id, patch) {
      const { edges } = get();
      if (!edges.some((edge) => edge.id === id)) return;
      set({
        edges: edges.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                ...(patch.label !== undefined ? { label: patch.label } : {}),
                data: {
                  kind: patch.kind ?? edge.data?.kind ?? 'sync',
                  // The rebuilt literal must pass carries through: a kind-only
                  // patch keeps the existing list, and `carries: []` clears it
                  // (serialization omits empty lists).
                  ...(patch.carries !== undefined
                    ? { carries: patch.carries }
                    : edge.data?.carries !== undefined
                      ? { carries: edge.data.carries }
                      : {}),
                  severity: edge.data?.severity ?? null,
                },
              }
            : edge,
        ),
        dirty: true,
      });
    },

    removeSelected() {
      const { nodes, edges, selectedId } = get();
      if (selectedId === null) return;
      if (nodes.some((node) => node.id === selectedId)) {
        set({
          nodes: nodes.filter((node) => node.id !== selectedId),
          edges: edges.filter((edge) => edge.source !== selectedId && edge.target !== selectedId),
          selectedId: null,
          dirty: true,
        });
        return;
      }
      if (edges.some((edge) => edge.id === selectedId)) {
        set({
          edges: edges.filter((edge) => edge.id !== selectedId),
          selectedId: null,
          dirty: true,
        });
      }
    },

    select(id) {
      set({ selectedId: id });
    },

    setHighlight(highlight) {
      const { nodes, edges } = get();
      set({
        highlight,
        nodes: paintSeverity(nodes, new Set(highlight.nodeIds), highlight.severity),
        edges: paintSeverity(edges, new Set(highlight.edgeIds), highlight.severity),
      });
    },

    clearHighlight() {
      const { nodes, edges, highlight } = get();
      if (!highlight) return;
      set({
        highlight: null,
        nodes: paintSeverity(nodes, new Set<string>(), null),
        edges: paintSeverity(edges, new Set<string>(), null),
      });
    },

    setNarrativeOverview(text) {
      set({ narrativeOverview: text, dirty: true });
    },

    setComponentRationale(nodeId, prose) {
      const { componentRationales } = get();
      const others = componentRationales.filter((rationale) => rationale.nodeId !== nodeId);
      // Empty prose is a cleared slot, not a stored empty one.
      set({
        componentRationales: prose.trim() === '' ? others : [...others, { nodeId, prose }],
        dirty: true,
      });
    },

    setCriterionNarration(criterionId, prose) {
      const { criterionNarrations } = get();
      const others = criterionNarrations.filter(
        (narration) => narration.criterionId !== criterionId,
      );
      set({
        criterionNarrations: prose.trim() === '' ? others : [...others, { criterionId, prose }],
        dirty: true,
      });
    },

    loadNarrative(narrative) {
      set({
        narrativeOverview: narrative?.overview ?? '',
        componentRationales: narrative?.componentRationales ?? [],
        criterionNarrations: narrative?.criterionNarrations ?? [],
      });
    },

    setBindingClaim(criterionId, claim) {
      set({
        bindings: upsert(get().bindings, criterionId, (current) => ({ ...current, claim })),
        dirty: true,
      });
    },

    toggleBindingNode(criterionId, nodeId) {
      const { bindings } = get();
      const existing = bindings.find((binding) => binding.criterionId === criterionId);
      const has = existing?.nodeIds.includes(nodeId) ?? false;
      // Capped here as well as in the payload, so the checkbox that would
      // exceed the limit is simply inert rather than silently dropped later.
      if (!has && (existing?.nodeIds.length ?? 0) >= BINDING_MAX_NODES) return;
      set({
        bindings: upsert(bindings, criterionId, (current) => ({
          ...current,
          nodeIds: has
            ? current.nodeIds.filter((id) => id !== nodeId)
            : [...current.nodeIds, nodeId],
        })),
        dirty: true,
      });
    },

    setBindingPath(criterionId, path) {
      set({
        bindings: upsert(get().bindings, criterionId, (current) => {
          const rest: Binding = {
            criterionId: current.criterionId,
            nodeIds: current.nodeIds,
            claim: current.claim,
          };
          return path.length === 0 ? rest : { ...rest, path };
        }),
        dirty: true,
      });
    },

    clearBinding(criterionId) {
      const { bindings } = get();
      if (!bindings.some((binding) => binding.criterionId === criterionId)) return;
      set({
        bindings: bindings.filter((binding) => binding.criterionId !== criterionId),
        dirty: true,
      });
    },

    loadBrief(brief) {
      set({ bindings: brief?.bindings.map((binding) => ({ ...binding })) ?? [] });
    },

    markClean() {
      set({ dirty: false });
    },

    markDirty() {
      set({ dirty: true });
    },

    serialize() {
      const { nodes, edges } = get();
      return toCanvasGraph(nodes, edges);
    },

    serializeBrief(criteria) {
      const { nodes, edges, bindings } = get();
      return reconcileBrief(bindings, toCanvasGraph(nodes, edges), criteria);
    },

    serializeNarrative(criteria) {
      const { nodes, edges, narrativeOverview, componentRationales, criterionNarrations } = get();
      return reconcileNarration(
        narrativeOverview,
        componentRationales,
        criterionNarrations,
        toCanvasGraph(nodes, edges),
        criteria,
      );
    },
  }));
}
