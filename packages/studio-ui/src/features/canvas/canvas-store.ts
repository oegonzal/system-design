import type { CanvasGraph } from '@sysdesign/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { fromCanvasGraph } from './graph-io';
import { briefActions } from './store/brief-actions';
import { draftActions } from './store/draft-actions';
import { graphActions } from './store/graph-actions';
import { editsOf, EMPTY_HISTORY, historyActions } from './store/history';
import { modelActions } from './store/model-actions';
import { narrativeActions } from './store/narrative-actions';
import type { CanvasState } from './store/state';
import { viewActions } from './store/view-actions';

export type CanvasStore = StoreApi<CanvasState>;

/**
 * A factory, deliberately — no module-level store instance. Each practice
 * workspace mounts its own store, so two sessions in one browser tab
 * lifecycle can never bleed graphs into each other.
 */
export function createCanvasStore(initial?: CanvasGraph): CanvasStore {
  return createStore<CanvasState>()((set, get) => {
    const deps = { set, get, edits: editsOf(set, get) };
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
      decisions: [],
      assumptions: [],
      entities: [],
      relations: [],
      bindings: [],
      highlight: null,

      ...graphActions(deps),
      ...historyActions(deps),
      ...viewActions(deps),
      ...narrativeActions(deps),
      ...modelActions(deps),
      ...briefActions(deps),
      ...draftActions(deps),
    };
  });
}
