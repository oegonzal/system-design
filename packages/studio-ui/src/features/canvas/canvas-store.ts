import type {
  BriefBindingProposal,
  CanvasGraph,
  ComponentRationale,
  DesignBrief,
  DesignNarrative,
  EdgeIntent,
  EdgeKind,
  FlowBinding,
  FlowNarration,
  GraphPatch,
  InterfaceProposal,
  MechanismClaim,
  NfrBinding,
  NodeConfig,
  NodeKind,
  NodeOperation,
  Severity,
} from '@sysdesign/contracts';
import {
  BINDING_MAX_NODES,
  canonicalizeGraphConfig,
  MECHANISM_KINDS,
  NODE_MAX_OPERATIONS,
  NODE_MAX_RESPONSIBILITIES,
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

import { flowIdFor, reconcileBrief } from './brief-draft';
import { applySuggestionPatch, fromCanvasGraph, toCanvasGraph, toGhostElements } from './graph-io';
import { reconcileNarration } from './narration-draft';
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
  /**
   * The design-narrative draft submitted alongside the graph — reference-
   * anchored prose held as three slot groups (an overview, a rationale per
   * node id, a narration per functional-requirement ordinal), the shape
   * `serializeNarrative` reconciles into a `DesignNarrative`.
   *
   * Deliberately orthogonal to the graph, exactly as the brief is: `setGraph`
   * never touches these and `serialize` never includes them — loading a
   * revision pairs `setGraph` with `loadNarrative`, and submitting reads both
   * separately. Stale references (a rationale for a deleted node) are tolerated
   * and dropped once, at `serializeNarrative`.
   */
  narrativeOverview: string;
  componentRationales: ComponentRationale[];
  flowNarrations: FlowNarration[];
  /**
   * The design brief being drafted — the GRADED half of explaining a design,
   * beside the unscored walkthrough. Orthogonal to the graph exactly as the
   * narrative is: `setGraph` never touches it, `serialize` never includes it.
   *
   * Held as the draft the editor edits, not as a payload. Stale references are
   * tolerated here (a bound node can be deleted afterwards) and resolved once,
   * at `serializeBrief`, because a canvas edit must never silently rewrite what
   * the author wrote.
   *
   * At most one binding per requirement and one flow per functional
   * requirement, which is what makes the API's uniqueness rules unreachable
   * rather than merely respected.
   */
  briefBindings: NfrBinding[];
  briefFlows: FlowBinding[];
  /**
   * Machine proposals awaiting a human answer. A SEPARATE slice, not a flag on
   * a binding, so `serializeBrief` structurally cannot reach them — the ghost
   * overlay solves the same problem by filtering at the serialization boundary,
   * but a brief payload is validated field by field (`forbidNonWhitelisted`),
   * so an extra marker parked on a binding would reject the whole submission.
   * Keeping proposals out of `briefBindings` makes "unaccepted work is never
   * submitted" a property of the shape rather than of remembering to strip.
   */
  briefProposals: BriefBindingProposal[];
  /**
   * Machine-proposed interface items for ONE node, held apart from the node
   * for the same reason brief proposals are held apart from bindings: an
   * unaccepted item must be structurally unable to reach `serialize`. Tied to
   * the node they were computed for — selecting another node discards them.
   */
  interfaceProposals: { nodeId: string; items: InterfaceProposal[] } | null;
  ghost: GhostState | null;
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
      config?: NodeConfig;
      responsibilities?: string[];
      operations?: NodeOperation[];
    },
  ): void;
  updateEdge(
    id: string,
    patch: { kind?: EdgeKind; intent?: EdgeIntent; label?: string; carries?: string[] },
  ): void;
  removeSelected(): void;
  select(id: string | null): void;
  setHighlight(highlight: HighlightState): void;
  clearHighlight(): void;
  previewPatch(patch: GraphPatch, findingId: string): void;
  clearGhost(): void;
  acceptGhost(): void;
  /** Author edit — sets the big-picture overview and dirties the draft. */
  setNarrativeOverview(text: string): void;
  /** Author edit — sets one component's rationale; empty prose clears the slot. */
  setComponentRationale(nodeId: string, prose: string): void;
  /** Author edit — sets one requirement's flow narration; empty prose clears it. */
  setFlowNarration(requirementIndex: number, prose: string): void;
  /** Revision load — replaces the narrative draft without touching `dirty`. */
  loadNarrative(narrative: DesignNarrative | null): void;
  /**
   * Claim a requirement is held by this mechanism. Changing the mechanism
   * drops nodes the new one cannot legally carry, so the picker and the
   * binding can never disagree about eligibility.
   */
  setBindingMechanism(nfrId: string, mechanism: MechanismClaim): void;
  toggleBindingNode(nfrId: string, nodeId: string): void;
  setBindingNote(nfrId: string, note: string): void;
  clearBinding(nfrId: string): void;
  /** Replace the walk for one functional requirement; an empty path clears it. */
  setFlowPath(requirementIndex: number, path: string[]): void;
  /** Revision load — replaces the brief without touching `dirty`. */
  loadBrief(brief: DesignBrief | null): void;
  /** Fresh proposals from the model. Never dirties: nobody has decided yet. */
  loadProposals(proposals: BriefBindingProposal[]): void;
  /** Take the proposal for this requirement, replacing any binding there. */
  acceptProposal(nfrId: string): void;
  dismissProposal(nfrId: string): void;
  /** Fresh interface proposals for a node. Never dirties: nobody has decided yet. */
  loadInterfaceProposals(nodeId: string, items: InterfaceProposal[]): void;
  /** Take one item into the node it was proposed for — an author edit, so it dirties. */
  acceptInterfaceProposal(id: string): void;
  dismissInterfaceProposal(id: string): void;
  markClean(): void;
  markDirty(): void;
  serialize(): CanvasGraph;
  /** The brief as a payload, reconciled against the live graph, or null. */
  serializeBrief(): DesignBrief | null;
  /** The narrative as a payload, reconciled against the live graph, or null. */
  serializeNarrative(): DesignNarrative | null;
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
    narrativeOverview: '',
    componentRationales: [],
    flowNarrations: [],
    briefBindings: [],
    briefFlows: [],
    briefProposals: [],
    interfaceProposals: null,
    ghost: null,
    highlight: null,

    setGraph(graph) {
      // A stored design may carry a knob its kind no longer offers (retired
      // since it was saved). The panel could not show it and the grader never
      // read it, so dropping it here loses nothing visible — and keeps a
      // resubmit from being refused for a key the author never chose.
      const { nodes, edges } = fromCanvasGraph(canonicalizeGraphConfig(graph));
      // Proposals are cleared with the ghost and for the same reason: both were
      // computed against the design being replaced, and a stale one would
      // invite the author to accept a claim about a diagram they no longer have.
      set({
        nodes,
        edges,
        selectedId: null,
        dirty: false,
        ghost: null,
        highlight: null,
        briefProposals: [],
        interfaceProposals: null,
      });
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
                  ...(patch.intent !== undefined
                    ? { intent: patch.intent }
                    : edge.data?.intent !== undefined
                      ? { intent: edge.data.intent }
                      : {}),
                  // The rebuilt literal must pass carries through: a kind-only
                  // patch keeps the existing list, and `carries: []` clears it
                  // (serialization omits empty lists).
                  ...(patch.carries !== undefined
                    ? { carries: patch.carries }
                    : edge.data?.carries !== undefined
                      ? { carries: edge.data.carries }
                      : {}),
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
      const { interfaceProposals } = get();
      // Proposals were computed for one node; they do not follow the selection.
      set({
        selectedId: id,
        ...(interfaceProposals !== null && interfaceProposals.nodeId !== id
          ? { interfaceProposals: null }
          : {}),
      });
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

    setNarrativeOverview(text) {
      set({ narrativeOverview: text, dirty: true });
    },

    setComponentRationale(nodeId, prose) {
      const { componentRationales } = get();
      const others = componentRationales.filter((rationale) => rationale.nodeId !== nodeId);
      // Empty prose is a cleared slot, not a stored empty one — mirrors how a
      // flow with an empty path clears rather than persists.
      set({
        componentRationales: prose.trim() === '' ? others : [...others, { nodeId, prose }],
        dirty: true,
      });
    },

    setFlowNarration(requirementIndex, prose) {
      const { flowNarrations } = get();
      const others = flowNarrations.filter((flow) => flow.requirementIndex !== requirementIndex);
      set({
        flowNarrations:
          prose.trim() === ''
            ? others
            : [...others, { requirementIndex, prose }].sort(
                (a, b) => a.requirementIndex - b.requirementIndex,
              ),
        dirty: true,
      });
    },

    loadNarrative(narrative) {
      set({
        narrativeOverview: narrative?.overview ?? '',
        componentRationales: narrative?.componentRationales ?? [],
        flowNarrations: narrative?.flowNarrations ?? [],
      });
    },

    setBindingMechanism(nfrId, mechanism) {
      const { briefBindings, nodes } = get();
      const existing = briefBindings.find((binding) => binding.nfrId === nfrId);
      // Re-filter rather than clear: switching from `backups` to `sharding`
      // keeps the databases already picked and drops anything else, because
      // the API refuses a kind that cannot carry the claim.
      const kinds: readonly NodeKind[] = MECHANISM_KINDS[mechanism];
      const nodeIds = (existing?.nodeIds ?? []).filter((id) =>
        nodes.some((node) => node.id === id && kinds.includes(node.data.kind)),
      );
      const next: NfrBinding = {
        nfrId,
        mechanism,
        nodeIds,
        ...(existing?.note !== undefined ? { note: existing.note } : {}),
      };
      set({
        briefBindings: existing
          ? briefBindings.map((binding) => (binding.nfrId === nfrId ? next : binding))
          : [...briefBindings, next],
        dirty: true,
      });
    },

    toggleBindingNode(nfrId, nodeId) {
      const { briefBindings } = get();
      const existing = briefBindings.find((binding) => binding.nfrId === nfrId);
      if (!existing) return;
      const has = existing.nodeIds.includes(nodeId);
      // Capped here as well as in the payload, so the checkbox that would
      // exceed the limit is simply inert rather than silently dropped later.
      if (!has && existing.nodeIds.length >= BINDING_MAX_NODES) return;
      const nodeIds = has
        ? existing.nodeIds.filter((id) => id !== nodeId)
        : [...existing.nodeIds, nodeId];
      set({
        briefBindings: briefBindings.map((binding) =>
          binding.nfrId === nfrId ? { ...binding, nodeIds } : binding,
        ),
        dirty: true,
      });
    },

    setBindingNote(nfrId, note) {
      const { briefBindings } = get();
      set({
        briefBindings: briefBindings.map((binding) =>
          binding.nfrId === nfrId ? { ...binding, note } : binding,
        ),
        dirty: true,
      });
    },

    clearBinding(nfrId) {
      const { briefBindings } = get();
      if (!briefBindings.some((binding) => binding.nfrId === nfrId)) return;
      set({
        briefBindings: briefBindings.filter((binding) => binding.nfrId !== nfrId),
        dirty: true,
      });
    },

    setFlowPath(requirementIndex, path) {
      const { briefFlows } = get();
      const others = briefFlows.filter((flow) => flow.requirementIndex !== requirementIndex);
      set({
        briefFlows:
          path.length === 0
            ? others
            : [...others, { id: flowIdFor(requirementIndex), requirementIndex, path }].sort(
                (a, b) => a.requirementIndex - b.requirementIndex,
              ),
        dirty: true,
      });
    },

    loadBrief(brief) {
      set({ briefBindings: brief?.nfrBindings ?? [], briefFlows: brief?.flows ?? [] });
    },

    loadProposals(proposals) {
      set({ briefProposals: proposals });
    },

    acceptProposal(nfrId) {
      const { briefProposals, briefBindings } = get();
      const proposal = briefProposals.find((candidate) => candidate.nfrId === nfrId);
      if (!proposal) return;

      // Accepting is an author edit, so it dirties — matching `acceptGhost`.
      // The rationale is deliberately NOT carried into `note`: that field is
      // the author's own reasoning, and storing model prose there would be a
      // lie about who wrote it.
      const binding: NfrBinding = {
        nfrId: proposal.nfrId,
        mechanism: proposal.mechanism,
        nodeIds: [...proposal.nodeIds],
      };
      const existing = briefBindings.some((candidate) => candidate.nfrId === nfrId);
      set({
        briefBindings: existing
          ? briefBindings.map((candidate) => (candidate.nfrId === nfrId ? binding : candidate))
          : [...briefBindings, binding],
        briefProposals: briefProposals.filter((candidate) => candidate.nfrId !== nfrId),
        dirty: true,
      });
    },

    dismissProposal(nfrId) {
      const { briefProposals } = get();
      if (!briefProposals.some((candidate) => candidate.nfrId === nfrId)) return;
      set({ briefProposals: briefProposals.filter((candidate) => candidate.nfrId !== nfrId) });
    },

    loadInterfaceProposals(nodeId, items) {
      set({ interfaceProposals: { nodeId, items } });
    },

    acceptInterfaceProposal(id) {
      const { interfaceProposals, nodes } = get();
      const proposal = interfaceProposals?.items.find((candidate) => candidate.id === id);
      const node = nodes.find((candidate) => candidate.id === interfaceProposals?.nodeId);
      if (!interfaceProposals || !proposal || !node) return;

      // Each kind lands through the same field the editor writes, under the
      // same caps — an accepted proposal is indistinguishable from a typed one.
      // The rationale is display only, never stored (see acceptProposal).
      const patch = ((): Partial<SdNode['data']> | null => {
        switch (proposal.kind) {
          case 'operation': {
            const operations = node.data.operations ?? [];
            if (operations.length >= NODE_MAX_OPERATIONS) return null;
            if (operations.some((op) => op.name === proposal.operation.name)) return null;
            return { operations: [...operations, proposal.operation] };
          }
          case 'config':
            return { config: { ...(node.data.config ?? {}), [proposal.key]: proposal.value } };
          case 'responsibility': {
            const responsibilities = node.data.responsibilities ?? [];
            if (responsibilities.length >= NODE_MAX_RESPONSIBILITIES) return null;
            if (responsibilities.includes(proposal.text)) return null;
            return { responsibilities: [...responsibilities, proposal.text] };
          }
        }
      })();
      const remaining = interfaceProposals.items.filter((candidate) => candidate.id !== id);
      if (patch === null) {
        set({ interfaceProposals: { ...interfaceProposals, items: remaining } });
        return;
      }
      set({
        nodes: nodes.map((candidate) =>
          candidate.id === node.id
            ? { ...candidate, data: { ...candidate.data, ...patch } }
            : candidate,
        ),
        interfaceProposals: { ...interfaceProposals, items: remaining },
        dirty: true,
      });
    },

    dismissInterfaceProposal(id) {
      const { interfaceProposals } = get();
      if (!interfaceProposals?.items.some((candidate) => candidate.id === id)) return;
      set({
        interfaceProposals: {
          ...interfaceProposals,
          items: interfaceProposals.items.filter((candidate) => candidate.id !== id),
        },
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

    serializeBrief() {
      const { nodes, edges, briefBindings, briefFlows } = get();
      return reconcileBrief(briefBindings, briefFlows, toCanvasGraph(nodes, edges));
    },

    serializeNarrative() {
      const { nodes, edges, narrativeOverview, componentRationales, flowNarrations } = get();
      return reconcileNarration(
        narrativeOverview,
        componentRationales,
        flowNarrations,
        toCanvasGraph(nodes, edges),
      );
    },
  }));
}
