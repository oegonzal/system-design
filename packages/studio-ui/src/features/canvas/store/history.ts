import { focusPainted, paintFocus, paintSeverity, unselected } from './elements';
import {
  HISTORY_LIMIT,
  type CanvasContent,
  type CanvasHistory,
  type CanvasState,
  type FocusState,
  type GetCanvas,
  type HighlightState,
  type SetCanvas,
} from './state';

/** A history with nothing to undo or redo: where every load starts. */
export const EMPTY_HISTORY: CanvasHistory = { past: [], future: [], openKey: null };

function contentOf(state: CanvasContent): CanvasContent {
  return {
    nodes: state.nodes,
    edges: state.edges,
    bindings: state.bindings,
    narrativeOverview: state.narrativeOverview,
    componentRationales: state.componentRationales,
    criterionNarrations: state.criterionNarrations,
    decisions: state.decisions,
    assumptions: state.assumptions,
    entities: state.entities,
    relations: state.relations,
  };
}

/** A history entry put back on screen: nothing selected, the live highlight and the shown path repainted. */
function restored(
  content: CanvasContent,
  highlight: HighlightState | null,
  focus: FocusState | null,
): CanvasContent & { focus: FocusState | null } {
  const severity = highlight?.severity ?? null;
  const nodes = paintSeverity(
    content.nodes.map(unselected),
    new Set(highlight?.nodeIds ?? []),
    severity,
  );
  const edges = paintSeverity(
    content.edges.map(unselected),
    new Set(highlight?.edgeIds ?? []),
    severity,
  );
  return { ...content, ...focusPainted({ nodes, edges, bindings: content.bindings, focus }) };
}

/** How an action changes the content: as an author's edit, or as a load. */
export interface Edits {
  commit(patch: Partial<CanvasState>, key?: string | null, seal?: boolean): void;
  loaded(content: Partial<CanvasContent>): Partial<CanvasState>;
}

/** What every group of actions is built from. */
export interface ActionDeps {
  set: SetCanvas;
  get: GetCanvas;
  edits: Edits;
}

/** The two ways content changes, bound to one store: an author's edit, kept for undo, and a load, which starts the history again. */
export function editsOf(set: SetCanvas, get: GetCanvas): Edits {
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
    // A shown path is repainted on whatever the edit touched: a block added
    // while a path is shown reads off it, a hop added to the shown path is numbered.
    const touched = 'nodes' in patch || 'edges' in patch || 'bindings' in patch;
    const repaint =
      touched && (state.focus !== null || patch.focus !== undefined)
        ? focusPainted({
            nodes: patch.nodes ?? state.nodes,
            edges: patch.edges ?? state.edges,
            bindings: patch.bindings ?? state.bindings,
            focus: patch.focus === undefined ? state.focus : patch.focus,
          })
        : {};
    set({
      ...patch,
      ...repaint,
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
    // A load starts fresh: no path shown, and no paint left on what stays.
    const stripped = paintFocus(content.nodes ?? state.nodes, content.edges ?? state.edges, null);
    return {
      ...content,
      ...stripped,
      focus: null,
      contentVersion: state.contentVersion + 1,
      history: EMPTY_HISTORY,
      ...(framed ? { fitRequest: state.fitRequest + 1 } : {}),
    };
  };

  return { commit, loaded };
}

/** Undo and redo: a step back or forth through the history, refused while read-only. */
export const historyActions = ({ set, get }: ActionDeps): Pick<CanvasState, 'undo' | 'redo'> => {
  const step = (direction: 'undo' | 'redo') => {
    const state = get();
    const { past, future } = state.history;
    const source = direction === 'undo' ? past : future;
    const target = source.at(-1);
    if (state.readOnly || target === undefined) return;
    const current = contentOf(state);
    set({
      ...restored(target, state.highlight, state.focus),
      selectedId: null,
      dirty: true,
      contentVersion: state.contentVersion + 1,
      history:
        direction === 'undo'
          ? { past: past.slice(0, -1), future: [...future, current], openKey: null }
          : { past: [...past, current], future: future.slice(0, -1), openKey: null },
    });
  };

  return {
    undo() {
      step('undo');
    },

    redo() {
      step('redo');
    },
  };
};
