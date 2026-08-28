import type {
  CanvasGraph,
  EdgeKind,
  GraphPatch,
  NodeConfig,
  NodeKind,
  Severity,
} from '@sysdesign/contracts';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { applySuggestionPatch, fromCanvasGraph, toCanvasGraph, toGhostElements } from './graph-io';
import type { SdEdge, SdNode } from './types';

/** Default label when a kind is dropped from the palette. */
export const DEFAULT_NODE_LABELS = {
  client: 'Client',
  cdn: 'CDN',
  dns: 'DNS',
  gateway: 'API Gateway',
  'load-balancer': 'Load Balancer',
  service: 'Service',
  worker: 'Worker',
  database: 'Database',
  replica: 'Read Replica',
  cache: 'Cache',
  queue: 'Queue',
  'event-stream': 'Event Stream',
  'object-store': 'Object Store',
  'search-index': 'Search Index',
  scheduler: 'Scheduler',
  'external-api': 'External API',
} as const satisfies Record<NodeKind, string>;

export interface HighlightState {
  nodeIds: string[];
  edgeIds: string[];
  severity: Severity;
}

export interface GhostState {
  patch: GraphPatch;
  findingId: string;
}

export interface CanvasState {
  nodes: SdNode[];
  edges: SdEdge[];
  selectedId: string | null;
  /** Unsaved-draft flag: set by edits, cleared by setGraph/markClean. */
  dirty: boolean;
  ghost: GhostState | null;
  highlight: HighlightState | null;

  setGraph(graph: CanvasGraph): void;
  addNode(kind: NodeKind, position?: XYPosition): SdNode;
  onNodesChange(changes: NodeChange<SdNode>[]): void;
  onEdgesChange(changes: EdgeChange<SdEdge>[]): void;
  onConnect(connection: Connection): void;
  updateNode(id: string, patch: { label?: string; kind?: NodeKind; config?: NodeConfig }): void;
  updateEdge(id: string, patch: { kind?: EdgeKind; label?: string }): void;
  removeSelected(): void;
  select(id: string | null): void;
  setHighlight(highlight: HighlightState): void;
  clearHighlight(): void;
  previewPatch(patch: GraphPatch, findingId: string): void;
  clearGhost(): void;
  acceptGhost(): void;
  markClean(): void;
  markDirty(): void;
  serialize(): CanvasGraph;
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
    ghost: null,
    highlight: null,

    setGraph(graph) {
      const { nodes, edges } = fromCanvasGraph(graph);
      set({ nodes, edges, selectedId: null, dirty: false, ghost: null, highlight: null });
    },

    addNode(kind, position) {
      const { nodes } = get();
      const realCount = nodes.filter((node) => !node.data.ghost).length;
      const node: SdNode = {
        id: nextId('n', nodes),
        type: 'sd',
        // Drops give an exact position; keyboard-adds stagger from the count
        // so consecutive adds never stack invisibly on one spot.
        position: position ?? { x: 240 + (realCount % 5) * 48, y: 160 + (realCount % 5) * 48 },
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
        (edge) =>
          !edge.data?.ghost &&
          edge.source === connection.source &&
          edge.target === connection.target,
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
                  ...(edge.data?.ghost ? { ghost: edge.data.ghost } : {}),
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

    previewPatch(patch, findingId) {
      const { nodes, edges } = get();
      const real = {
        nodes: nodes.filter((node) => !node.data.ghost),
        edges: edges.filter((edge) => !edge.data?.ghost),
      };
      const overlay = toGhostElements(patch, toCanvasGraph(real.nodes, real.edges));
      set({
        nodes: [...real.nodes, ...overlay.nodes],
        edges: [...real.edges, ...overlay.edges],
        ghost: { patch, findingId },
      });
    },

    clearGhost() {
      const { nodes, edges, ghost } = get();
      if (!ghost) return;
      set({
        nodes: nodes.filter((node) => !node.data.ghost),
        edges: edges.filter((edge) => !edge.data?.ghost),
        ghost: null,
      });
    },

    acceptGhost() {
      const { nodes, edges, ghost } = get();
      if (!ghost) return;
      const real = toCanvasGraph(
        nodes.filter((node) => !node.data.ghost),
        edges.filter((edge) => !edge.data?.ghost),
      );
      const merged = applySuggestionPatch(real, ghost.patch);
      const hydrated = fromCanvasGraph(merged);
      set({
        nodes: hydrated.nodes,
        edges: hydrated.edges,
        ghost: null,
        highlight: null,
        dirty: true,
      });
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
  }));
}
