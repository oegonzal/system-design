import {
  DESIGN_BRIEF_VERSION,
  DESIGN_MODEL_VERSION,
  NARRATION_VERSION,
  reconcileBrief,
  reconcileModel,
  reconcileNarration,
} from '@sysdesign/contracts';

import { fromCanvasGraph, toCanvasGraph } from '../graph-io';
import type { ActionDeps } from './history';
import type { CanvasState } from './state';

export type DraftActions = Pick<
  CanvasState,
  | 'setGraph'
  | 'loadDraft'
  | 'serializeDraft'
  | 'serialize'
  | 'serializeBrief'
  | 'serializeNarrative'
  | 'serializeModel'
  | 'loadModel'
  | 'markClean'
  | 'markDirty'
>;

/** The canvas as the server sees it: loaded from a revision or a draft, and serialized back for a save or a submit. */
export const draftActions = ({ set, get, edits: { loaded } }: ActionDeps): DraftActions => ({
  setGraph(graph) {
    set({
      ...loaded(fromCanvasGraph(graph)),
      selectedId: null,
      dirty: false,
      highlight: null,
    });
  },

  loadDraft(draft) {
    const restored = loaded({
      ...fromCanvasGraph(draft.graph),
      bindings: draft.brief?.bindings.map((binding) => ({ ...binding })) ?? [],
      narrativeOverview: draft.narrative?.overview ?? '',
      componentRationales: draft.narrative?.componentRationales ?? [],
      criterionNarrations: draft.narrative?.criterionNarrations ?? [],
      decisions: draft.narrative?.decisions ?? [],
      assumptions: draft.narrative?.assumptions ?? [],
      entities: draft.model?.entities ?? [],
      relations: draft.model?.relations ?? [],
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
      decisions,
      assumptions,
      entities,
      relations,
    } = get();
    const narrativeEmpty =
      narrativeOverview.length === 0 &&
      componentRationales.length === 0 &&
      criterionNarrations.length === 0 &&
      decisions.length === 0 &&
      assumptions.length === 0;
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
            ...(decisions.length > 0 ? { decisions: decisions.map((item) => ({ ...item })) } : {}),
            ...(assumptions.length > 0 ? { assumptions: [...assumptions] } : {}),
          },
      model:
        entities.length === 0
          ? null
          : {
              version: DESIGN_MODEL_VERSION,
              entities: entities.map((item) => ({ ...item })),
              relations: relations.map((item) => ({ ...item })),
            },
    };
  },

  serializeModel() {
    const { nodes, edges, entities, relations } = get();
    return reconcileModel(entities, relations, toCanvasGraph(nodes, edges));
  },

  loadModel(model) {
    set(loaded({ entities: model?.entities ?? [], relations: model?.relations ?? [] }));
  },

  serialize() {
    const { nodes, edges } = get();
    return toCanvasGraph(nodes, edges);
  },

  serializeBrief(criteria) {
    const { nodes, edges, bindings, entities, relations } = get();
    const graph = toCanvasGraph(nodes, edges);
    return reconcileBrief(bindings, graph, criteria, reconcileModel(entities, relations, graph));
  },

  serializeNarrative(criteria) {
    const {
      nodes,
      edges,
      narrativeOverview,
      componentRationales,
      criterionNarrations,
      decisions,
      assumptions,
    } = get();
    return reconcileNarration(
      narrativeOverview,
      componentRationales,
      criterionNarrations,
      toCanvasGraph(nodes, edges),
      criteria,
      decisions,
      assumptions,
    );
  },

  markClean() {
    set({ dirty: false });
  },

  markDirty() {
    set({ dirty: true });
  },
});
