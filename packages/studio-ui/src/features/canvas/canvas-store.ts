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
  SessionDraft,
  Severity,
} from '@sysdesign/contracts';
import {
  BINDING_NODES_BOUND,
  DEFAULT_NODE_LABELS,
  DESIGN_BRIEF_VERSION,
  NARRATION_VERSION,
  reconcileBrief,
  reconcileNarration,
} from '@sysdesign/contracts';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodePositionChange,
  type XYPosition,
} from '@xyflow/react';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ViewArea } from './framing';
import { NODE_MIN_FOOTPRINT, type Box } from './geometry';
import { fromCanvasGraph, toCanvasGraph } from './graph-io';
import { dropPosition, placeBlock, type Placement } from './placement';
import type { SdEdge, SdNode } from './types';

export interface HighlightState {
  nodeIds: string[];
  edgeIds: string[];
  severity: Severity;
}

/**
 * Everything an author's edit can change: what a draft is made of and what
 * undo puts back. Selection, highlight and measured sizes ride along on the
 * elements but are never what makes two versions different.
 *
 * The brief and the narrative are deliberately orthogonal to the graph:
 * `setGraph` never touches them and `serialize` never includes them —
 * loading a revision pairs `setGraph` with `loadBrief` and `loadNarrative`,
 * and submitting reads each separately. Both may hold stale references (a
 * rationale or binding for a deleted node), resolved once, at
 * `serializeBrief` / `serializeNarrative`, because a canvas edit must never
 * silently rewrite what the author wrote.
 */
export interface CanvasContent {
  nodes: SdNode[];
  edges: SdEdge[];
  /**
   * At most one binding per criterion, in the schema's own shape but allowed
   * to be incomplete while it is typed — an empty claim or no component yet.
   */
  bindings: Binding[];
  /** The narrative as three slot groups: an overview, a rationale per node id, a narration per criterion id. */
  narrativeOverview: string;
  componentRationales: ComponentRationale[];
  criterionNarrations: CriterionNarration[];
}

/** How many edits undo can walk back; the oldest is dropped past it. */
export const HISTORY_LIMIT = 100;

export interface CanvasHistory {
  /** Content before each edit, oldest first. */
  past: CanvasContent[];
  /** Content each undo stepped back from, the nearest last; any new edit empties it. */
  future: CanvasContent[];
  /**
   * The edit the newest `past` entry is still absorbing. Consecutive edits
   * under one key — the keystrokes of one field, the frames of one drag —
   * are one step; any other edit, an undo or a load ends it.
   */
  openKey: string | null;
}

/**
 * What the store may ask of the canvas on screen. `SdCanvas` attaches one
 * while it is mounted; without it, the store falls back to fixed defaults.
 */
export interface CanvasViewport {
  /** What the author can see, in flow coordinates, or null while the canvas has no size. */
  area(): ViewArea | null;
  /** Moves the view the least distance that shows `box` in full; the zoom stays. */
  reveal(box: Box): void;
}

export interface CanvasState extends CanvasContent {
  /**
   * The element the properties panel edits. It follows the `selected` flags
   * React Flow draws by — whatever selects or deselects on the canvas (a
   * click, a modifier-click that adds to the selection, a key, a drag, a
   * click on the empty pane) moves it, and `select` moves the flags with it
   * — so the panel and the canvas never disagree. Several elements may be
   * selected at once; this is the one of them the panel is about.
   */
  selectedId: string | null;
  /** Unsaved-draft flag: set by edits, cleared by setGraph/markClean. */
  dirty: boolean;
  /**
   * Counts changes to the content — every edit, undo, redo and load, and
   * nothing else. A selection, a measured size or a highlight leaves it
   * alone, so "the draft changed" is `contentVersion` changing.
   */
  contentVersion: number;
  /**
   * While true every author edit — adding, moving, connecting, deleting,
   * editing a field, the brief, the narrative, undo and redo — is a no-op,
   * whichever control asked. Loads, selection and highlight still work: a
   * revision on screen can be looked at, not changed.
   */
  readOnly: boolean;
  /** Bumped to ask the canvas on screen to frame the whole diagram; `SdCanvas` honours each bump. */
  fitRequest: number;
  /**
   * The content version the server's draft is known to match: set when a
   * draft is restored, so the autosave never writes back what it was just
   * handed. Any edit or load moves `contentVersion` past it.
   */
  restoredVersion: number | null;
  history: CanvasHistory;
  viewport: CanvasViewport | null;
  highlight: HighlightState | null;

  setGraph(graph: CanvasGraph): void;
  /**
   * Author edit; the new block is the selection. `position` drops it there
   * (kept on the pane); without one it takes the free place nearest the
   * middle of what is visible, clear of every other block — and when nothing
   * visible is free, the nearest free place beside it, which the view then
   * moves to show. Null when read-only.
   */
  addNode(kind: NodeKind, position?: XYPosition): SdNode | null;
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
  /** Author edit — one step: the nodes, every connection touching them, and the edges named. */
  removeElements(ids: { nodeIds: readonly string[]; edgeIds: readonly string[] }): void;
  removeSelected(): void;
  /** Author edit — empties the graph; the brief and narrative stay, as on any graph swap. */
  clear(): void;
  undo(): void;
  redo(): void;
  /** Makes `id` the one element selected, on the canvas as in the panel; null clears the selection. */
  select(id: string | null): void;
  /**
   * Makes `id` the element the panel edits when the canvas already has it
   * selected — a click on one of several — leaving the selection as it is.
   * Nothing happens for an element the canvas has not selected: a click
   * that selects reaches the store as React Flow's own `select` change.
   */
  inspect(id: string): void;
  setHighlight(highlight: HighlightState): void;
  clearHighlight(): void;
  setReadOnly(readOnly: boolean): void;
  /** Asks the canvas on screen to frame the diagram (once it is measured). */
  requestFit(): void;
  attachViewport(viewport: CanvasViewport | null): void;
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
  /**
   * Restores an unsubmitted draft — graph, brief and narrative together. The
   * canvas is dirty afterwards, unlike `setGraph`: a draft is unsubmitted
   * work, and the toolbar should say so. It is also saved work — the server
   * just handed it over — which `restoredVersion` records.
   */
  loadDraft(draft: SessionDraft): void;
  /**
   * The draft as the server keeps it: the graph, the bindings exactly as
   * typed (half-finished is fine, nothing is reconciled) and the narrative
   * slots; null halves when nothing was written.
   */
  serializeDraft(): SessionDraft;
  serialize(): CanvasGraph;
  /** The brief as a payload, reconciled against the live graph and rubric, or null. */
  serializeBrief(criteria: readonly CriterionRef[]): DesignBrief | null;
  /** The narrative as a payload, reconciled against the live graph and rubric, or null. */
  serializeNarrative(criteria: readonly CriterionRef[]): DesignNarrative | null;
}

export type CanvasStore = StoreApi<CanvasState>;

export const selectCanUndo = (state: CanvasState): boolean =>
  !state.readOnly && state.history.past.length > 0;
export const selectCanRedo = (state: CanvasState): boolean =>
  !state.readOnly && state.history.future.length > 0;

const EMPTY_HISTORY: CanvasHistory = { past: [], future: [], openKey: null };

/**
 * React Flow change types that describe the view, not the design: what is
 * selected and how big a block measured. Everything else edits the graph.
 */
const VIEW_CHANGE_TYPES: ReadonlySet<string> = new Set(['select', 'dimensions']);

const isViewChange = (change: { type: string }): boolean => VIEW_CHANGE_TYPES.has(change.type);

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

const unselected = <T extends SdNode | SdEdge>(element: T): T =>
  element.selected ? { ...element, selected: false } : element;

/**
 * The elements with exactly `id` flagged selected — what `selectedId` looks
 * like on the canvas. The same array when the flags already say so.
 */
function marked<T extends SdNode | SdEdge>(elements: T[], id: string | null): T[] {
  const stale = (element: T): boolean => (element.selected ?? false) !== (element.id === id);
  if (!elements.some(stale)) return elements;
  return elements.map((element) =>
    stale(element) ? ({ ...element, selected: element.id === id } as T) : element,
  );
}

/**
 * `selectedId` after React Flow reported `changes`: the element it just
 * selected; or, when the one the panel shows was deselected or removed,
 * whatever is still selected (`remaining`, the elements after the changes),
 * else nothing.
 */
function selectionAfter(
  changes: readonly (NodeChange<SdNode> | EdgeChange<SdEdge>)[],
  selectedId: string | null,
  remaining: readonly (SdNode | SdEdge)[],
): string | null {
  let next = selectedId;
  for (const change of changes) {
    if (change.type === 'select' && change.selected) next = change.id;
    else if ((change.type === 'select' || change.type === 'remove') && change.id === next) {
      next = null;
    }
  }
  if (next !== null || next === selectedId) return next;
  return remaining.find((element) => element.selected)?.id ?? null;
}

function contentOf(state: CanvasContent): CanvasContent {
  return {
    nodes: state.nodes,
    edges: state.edges,
    bindings: state.bindings,
    narrativeOverview: state.narrativeOverview,
    componentRationales: state.componentRationales,
    criterionNarrations: state.criterionNarrations,
  };
}

/** A history entry put back on screen: nothing selected, the live highlight repainted. */
function restored(content: CanvasContent, highlight: HighlightState | null): CanvasContent {
  const severity = highlight?.severity ?? null;
  return {
    ...content,
    nodes: paintSeverity(
      content.nodes.map(unselected),
      new Set(highlight?.nodeIds ?? []),
      severity,
    ),
    edges: paintSeverity(
      content.edges.map(unselected),
      new Set(highlight?.edgeIds ?? []),
      severity,
    ),
  };
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

/** One history key per field of one element, so a typed word is one undo step. */
const fieldKey = (scope: string, id: string, patch: object): string =>
  `${scope}:${id}:${Object.keys(patch).sort().join('+')}`;

/**
 * A factory, deliberately — no module-level store instance. Each practice
 * workspace mounts its own store, so two sessions in one browser tab
 * lifecycle can never bleed graphs into each other.
 */
export function createCanvasStore(initial?: CanvasGraph): CanvasStore {
  return createStore<CanvasState>()((set, get) => {
    /**
     * The one way an author edit lands: refused while read-only, recorded in
     * the history (or absorbed into the open step under the same key), and
     * counted as a new content version. `seal` closes the step after it.
     */
    const commit = (patch: Partial<CanvasState>, key: string | null = null, seal = false) => {
      const state = get();
      if (state.readOnly) return;
      const { history } = state;
      const absorbed = key !== null && key === history.openKey;
      set({
        ...patch,
        dirty: true,
        contentVersion: state.contentVersion + 1,
        history: {
          past: absorbed ? history.past : [...history.past, contentOf(state)].slice(-HISTORY_LIMIT),
          future: [],
          openKey: seal ? null : key,
        },
      });
    };

    /** A load replaces the content: a new baseline with no history, framed on screen. */
    const loaded = (content: Partial<CanvasContent>): Partial<CanvasState> => {
      const state = get();
      const framed = (content.nodes ?? []).length > 0;
      return {
        ...content,
        contentVersion: state.contentVersion + 1,
        history: EMPTY_HISTORY,
        ...(framed ? { fitRequest: state.fitRequest + 1 } : {}),
      };
    };

    const step = (direction: 'undo' | 'redo') => {
      const state = get();
      const { past, future } = state.history;
      const source = direction === 'undo' ? past : future;
      const target = source.at(-1);
      if (state.readOnly || target === undefined) return;
      const current = contentOf(state);
      set({
        ...restored(target, state.highlight),
        selectedId: null,
        dirty: true,
        contentVersion: state.contentVersion + 1,
        history:
          direction === 'undo'
            ? { past: past.slice(0, -1), future: [...future, current], openKey: null }
            : { past: [...past, current], future: future.slice(0, -1), openKey: null },
      });
    };

    const initialGraph = initial ? fromCanvasGraph(initial) : { nodes: [], edges: [] };

    return {
      ...initialGraph,
      selectedId: null,
      dirty: false,
      contentVersion: 0,
      readOnly: false,
      fitRequest: initialGraph.nodes.length > 0 ? 1 : 0,
      restoredVersion: null,
      history: EMPTY_HISTORY,
      viewport: null,
      narrativeOverview: '',
      componentRationales: [],
      criterionNarrations: [],
      bindings: [],
      highlight: null,

      setGraph(graph) {
        set({
          ...loaded(fromCanvasGraph(graph)),
          selectedId: null,
          dirty: false,
          highlight: null,
        });
      },

      addNode(kind, position) {
        const { nodes, edges, readOnly, viewport } = get();
        if (readOnly) return null;
        const area = viewport?.area() ?? null;
        const placed: Placement =
          position === undefined
            ? placeBlock(nodes, area?.clear ?? null)
            : {
                position: dropPosition(position, area?.pane ?? null),
                size: NODE_MIN_FOOTPRINT,
                visible: true,
              };
        const node: SdNode = {
          id: nextId('n', nodes),
          type: 'sd',
          position: placed.position,
          selected: true,
          data: { kind, label: DEFAULT_NODE_LABELS[kind] },
        };
        commit({
          nodes: [...nodes.map(unselected), node],
          edges: edges.map(unselected),
          selectedId: node.id,
        });
        if (!placed.visible) viewport?.reveal({ ...placed.position, ...placed.size });
        return node;
      },

      onNodesChange(changes) {
        const { nodes, edges, selectedId, readOnly } = get();
        const permitted = readOnly ? changes.filter(isViewChange) : changes;
        if (permitted.length === 0) return;
        const next = applyNodeChanges<SdNode>(permitted, nodes);
        const patch = {
          nodes: next,
          selectedId: selectionAfter(permitted, selectedId, [...next, ...edges]),
        };
        const edits = permitted.filter((change) => !isViewChange(change));
        if (edits.length === 0) {
          set(patch);
          return;
        }
        // A drag reports every frame; it is one step, closed when the drag ends.
        const moves = edits.filter(
          (change): change is NodePositionChange => change.type === 'position',
        );
        const key =
          moves.length === edits.length
            ? `move:${moves
                .map((change) => change.id)
                .sort()
                .join('+')}`
            : null;
        commit(
          patch,
          key,
          moves.some((change) => change.dragging === false),
        );
      },

      onEdgesChange(changes) {
        const { nodes, edges, selectedId, readOnly } = get();
        const permitted = readOnly ? changes.filter(isViewChange) : changes;
        if (permitted.length === 0) return;
        const next = applyEdgeChanges<SdEdge>(permitted, edges);
        const patch = {
          edges: next,
          selectedId: selectionAfter(permitted, selectedId, [...nodes, ...next]),
        };
        if (permitted.every(isViewChange)) set(patch);
        else commit(patch);
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
        commit({ edges: [...edges, edge] });
      },

      updateNode(id, patch) {
        const { nodes } = get();
        if (!nodes.some((node) => node.id === id)) return;
        commit(
          {
            nodes: nodes.map((node) =>
              node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
            ),
          },
          fieldKey('node', id, patch),
        );
      },

      updateEdge(id, patch) {
        const { edges } = get();
        if (!edges.some((edge) => edge.id === id)) return;
        commit(
          {
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
          },
          fieldKey('edge', id, patch),
        );
      },

      removeElements({ nodeIds, edgeIds }) {
        const { nodes, edges, selectedId } = get();
        const goneNodes = new Set(nodeIds);
        const goneEdges = new Set(edgeIds);
        const keptNodes = nodes.filter((node) => !goneNodes.has(node.id));
        const keptEdges = edges.filter(
          (edge) =>
            !goneEdges.has(edge.id) && !goneNodes.has(edge.source) && !goneNodes.has(edge.target),
        );
        if (keptNodes.length === nodes.length && keptEdges.length === edges.length) return;
        const selectionGone =
          selectedId !== null &&
          !keptNodes.some((node) => node.id === selectedId) &&
          !keptEdges.some((edge) => edge.id === selectedId);
        commit({
          nodes: keptNodes,
          edges: keptEdges,
          ...(selectionGone ? { selectedId: null } : {}),
        });
      },

      removeSelected() {
        const { nodes, selectedId, removeElements } = get();
        if (selectedId === null) return;
        const isNode = nodes.some((node) => node.id === selectedId);
        removeElements(
          isNode ? { nodeIds: [selectedId], edgeIds: [] } : { nodeIds: [], edgeIds: [selectedId] },
        );
      },

      clear() {
        const { nodes, edges } = get();
        if (nodes.length === 0 && edges.length === 0) return;
        commit({ nodes: [], edges: [], selectedId: null, highlight: null });
      },

      undo() {
        step('undo');
      },

      redo() {
        step('redo');
      },

      select(id) {
        const { nodes, edges } = get();
        set({ selectedId: id, nodes: marked(nodes, id), edges: marked(edges, id) });
      },

      inspect(id) {
        const { nodes, edges, selectedId } = get();
        if (id === selectedId) return;
        const element =
          nodes.find((node) => node.id === id) ?? edges.find((edge) => edge.id === id);
        if (!element?.selected) return;
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

      setReadOnly(readOnly) {
        const { history } = get();
        set({ readOnly, history: { ...history, openKey: null } });
      },

      requestFit() {
        set({ fitRequest: get().fitRequest + 1 });
      },

      attachViewport(viewport) {
        set({ viewport });
      },

      setNarrativeOverview(text) {
        commit({ narrativeOverview: text }, 'narrative:overview');
      },

      setComponentRationale(nodeId, prose) {
        const { componentRationales } = get();
        const others = componentRationales.filter((rationale) => rationale.nodeId !== nodeId);
        // Empty prose is a cleared slot, not a stored empty one.
        commit(
          {
            componentRationales: prose.trim() === '' ? others : [...others, { nodeId, prose }],
          },
          `narrative:rationale:${nodeId}`,
        );
      },

      setCriterionNarration(criterionId, prose) {
        const { criterionNarrations } = get();
        const others = criterionNarrations.filter(
          (narration) => narration.criterionId !== criterionId,
        );
        commit(
          {
            criterionNarrations: prose.trim() === '' ? others : [...others, { criterionId, prose }],
          },
          `narrative:narration:${criterionId}`,
        );
      },

      loadNarrative(narrative) {
        set(
          loaded({
            narrativeOverview: narrative?.overview ?? '',
            componentRationales: narrative?.componentRationales ?? [],
            criterionNarrations: narrative?.criterionNarrations ?? [],
          }),
        );
      },

      setBindingClaim(criterionId, claim) {
        commit(
          { bindings: upsert(get().bindings, criterionId, (current) => ({ ...current, claim })) },
          `binding:${criterionId}:claim`,
        );
      },

      toggleBindingNode(criterionId, nodeId) {
        const { bindings } = get();
        const existing = bindings.find((binding) => binding.criterionId === criterionId);
        const has = existing?.nodeIds.includes(nodeId) ?? false;
        // Capped here as well as in the payload, so the checkbox that would
        // exceed the limit is simply inert rather than silently dropped later.
        if (!has && (existing?.nodeIds.length ?? 0) >= BINDING_NODES_BOUND.target) return;
        commit({
          bindings: upsert(bindings, criterionId, (current) => ({
            ...current,
            nodeIds: has
              ? current.nodeIds.filter((id) => id !== nodeId)
              : [...current.nodeIds, nodeId],
          })),
        });
      },

      setBindingPath(criterionId, path) {
        commit({
          bindings: upsert(get().bindings, criterionId, (current) => {
            const rest: Binding = {
              criterionId: current.criterionId,
              nodeIds: current.nodeIds,
              claim: current.claim,
            };
            return path.length === 0 ? rest : { ...rest, path };
          }),
        });
      },

      clearBinding(criterionId) {
        const { bindings } = get();
        if (!bindings.some((binding) => binding.criterionId === criterionId)) return;
        commit({ bindings: bindings.filter((binding) => binding.criterionId !== criterionId) });
      },

      loadBrief(brief) {
        set(loaded({ bindings: brief?.bindings.map((binding) => ({ ...binding })) ?? [] }));
      },

      markClean() {
        set({ dirty: false });
      },

      markDirty() {
        set({ dirty: true });
      },

      loadDraft(draft) {
        const restored = loaded({
          ...fromCanvasGraph(draft.graph),
          bindings: draft.brief?.bindings.map((binding) => ({ ...binding })) ?? [],
          narrativeOverview: draft.narrative?.overview ?? '',
          componentRationales: draft.narrative?.componentRationales ?? [],
          criterionNarrations: draft.narrative?.criterionNarrations ?? [],
        });
        set({
          ...restored,
          restoredVersion: restored.contentVersion ?? null,
          selectedId: null,
          highlight: null,
          dirty: true,
        });
      },

      serializeDraft() {
        const {
          nodes,
          edges,
          bindings,
          narrativeOverview,
          componentRationales,
          criterionNarrations,
        } = get();
        const narrativeEmpty =
          narrativeOverview.length === 0 &&
          componentRationales.length === 0 &&
          criterionNarrations.length === 0;
        return {
          graph: toCanvasGraph(nodes, edges),
          brief:
            bindings.length === 0
              ? null
              : {
                  version: DESIGN_BRIEF_VERSION,
                  bindings: bindings.map((binding) => ({ ...binding })),
                },
          narrative: narrativeEmpty
            ? null
            : {
                version: NARRATION_VERSION,
                ...(narrativeOverview.length > 0 ? { overview: narrativeOverview } : {}),
                componentRationales: [...componentRationales],
                criterionNarrations: [...criterionNarrations],
              },
        };
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
    };
  });
}
