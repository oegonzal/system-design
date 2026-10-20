import type {
  Binding,
  CanvasGraph,
  ComponentRationale,
  CriterionNarration,
  CriterionRef,
  DesignBrief,
  DesignDecision,
  DesignModel,
  DesignNarrative,
  EdgeKind,
  ModelEntity,
  ModelRelation,
  NodeConfigEntry,
  NodeKind,
  NodeOperation,
  SessionDraft,
  Severity,
} from '@sysdesign/contracts';
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react';
import type { StoreApi } from 'zustand/vanilla';

import type { ViewArea } from '../framing';
import type { Box } from '../geometry';
import type { SdEdge, SdNode } from '../types';

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
  /** The narrative as four slot groups: an overview, a rationale per node id, a narration per criterion id, and the decisions the design rests on. */
  narrativeOverview: string;
  componentRationales: ComponentRationale[];
  criterionNarrations: CriterionNarration[];
  /** In the order the author added them; a row whose choice is still blank is kept while it is typed. */
  decisions: DesignDecision[];
  /** The assumptions the design depends on, one sentence each, in the order written. */
  assumptions: string[];
  /** The data model as it is typed: an entity whose name is still blank is kept, and a relation may name an entity not yet drawn. */
  entities: ModelEntity[];
  relations: ModelRelation[];
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
  /** Author edit — sets one component's rationale; empty prose clears the slot unless its trade-off is written. */
  setComponentRationale(nodeId: string, prose: string): void;
  /** Author edit — why this component and not another; empty text clears it. */
  setComponentTradeoff(nodeId: string, tradeoff: string): void;
  /** Author edit — a new blank decision row at the end. */
  addDecision(): void;
  /** Author edit — patches the decision at `index`; a field set to an empty string is cleared. */
  updateDecision(index: number, patch: Partial<DesignDecision>): void;
  removeDecision(index: number): void;
  /** Author edit — a new blank assumption at the end. */
  addAssumption(): void;
  setAssumption(index: number, text: string): void;
  removeAssumption(index: number): void;
  /** Author edit — a new entity with a fresh id and a blank name; the selection stays on the canvas. */
  addEntity(): void;
  updateEntity(id: string, patch: Partial<Omit<ModelEntity, 'id'>>): void;
  removeEntity(id: string): void;
  addRelation(relation: ModelRelation): void;
  updateRelation(index: number, patch: Partial<ModelRelation>): void;
  removeRelation(index: number): void;
  /** Revision load — replaces the model draft without touching `dirty`. */
  loadModel(model: DesignModel | null): void;
  /** The model as a payload, reconciled against the live graph, or null. */
  serializeModel(): DesignModel | null;
  /** Author edit — sets one criterion's narration; empty prose clears it. */
  setCriterionNarration(criterionId: string, prose: string): void;
  /** Revision load — replaces the narrative draft without touching `dirty`. */
  loadNarrative(narrative: DesignNarrative | null): void;
  /** Author edit — adds or removes one entity on a criterion's binding. */
  toggleBindingEntity(criterionId: string, entityId: string): void;
  /** Author edit — the claim in the author's words; creates the binding on first use. */
  setBindingClaim(criterionId: string, claim: string): void;
  /** Author edit — why this mechanism and not another; empty text clears it. */
  setBindingTradeoff(criterionId: string, tradeoff: string): void;
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

export const selectCanUndo = (state: CanvasState): boolean =>
  !state.readOnly && state.history.past.length > 0;
export const selectCanRedo = (state: CanvasState): boolean =>
  !state.readOnly && state.history.future.length > 0;

/** The store's own setter and getter, as every group of actions receives them. */
export type SetCanvas = StoreApi<CanvasState>['setState'];
export type GetCanvas = StoreApi<CanvasState>['getState'];
