import { paintSeverity, unselected } from './elements';
import {
  HISTORY_LIMIT,
  type CanvasContent,
  type CanvasHistory,
  type CanvasState,
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

  return {
    undo() {
      step('undo');
    },

    redo() {
      step('redo');
    },
  };
};
