import type { ComponentRationale, DesignDecision } from '@sysdesign/contracts';

import type { ActionDeps } from './history';
import type { CanvasState } from './state';

export type NarrativeActions = Pick<
  CanvasState,
  | 'setNarrativeOverview'
  | 'setComponentRationale'
  | 'setComponentTradeoff'
  | 'setCriterionNarration'
  | 'addDecision'
  | 'updateDecision'
  | 'removeDecision'
  | 'addAssumption'
  | 'setAssumption'
  | 'removeAssumption'
  | 'loadNarrative'
>;

/** A rationale slot is kept while either half — the prose or the trade-off — is written. */
const rationaleSlot = (
  nodeId: string,
  prose: string,
  tradeoff: string | undefined,
): ComponentRationale | null => {
  const written = prose.trim() !== '' || (tradeoff?.trim() ?? '') !== '';
  if (!written) return null;
  return {
    nodeId,
    prose,
    ...(tradeoff !== undefined && tradeoff.trim() !== '' ? { tradeoff } : {}),
  };
};

/** The narrative the author writes beside the diagram: an overview, a rationale and a trade-off per block, a narration per criterion, and the decisions the design rests on. */
export const narrativeActions = ({
  set,
  get,
  edits: { commit, loaded },
}: ActionDeps): NarrativeActions => ({
  setNarrativeOverview(text) {
    commit({ narrativeOverview: text }, 'narrative:overview');
  },

  setComponentRationale(nodeId, prose) {
    const { componentRationales } = get();
    const current = componentRationales.find((rationale) => rationale.nodeId === nodeId);
    const others = componentRationales.filter((rationale) => rationale.nodeId !== nodeId);
    // Empty prose is a cleared slot, not a stored empty one.
    const slot = rationaleSlot(nodeId, prose, current?.tradeoff);
    commit(
      { componentRationales: slot === null ? others : [...others, slot] },
      `narrative:rationale:${nodeId}`,
    );
  },

  setComponentTradeoff(nodeId, tradeoff) {
    const { componentRationales } = get();
    const current = componentRationales.find((rationale) => rationale.nodeId === nodeId);
    const others = componentRationales.filter((rationale) => rationale.nodeId !== nodeId);
    const slot = rationaleSlot(nodeId, current?.prose ?? '', tradeoff);
    commit(
      { componentRationales: slot === null ? others : [...others, slot] },
      `narrative:tradeoff:${nodeId}`,
    );
  },

  addDecision() {
    commit({ decisions: [...get().decisions, { choice: '' }] });
  },

  updateDecision(index, patch) {
    const { decisions } = get();
    const current = decisions[index];
    if (current === undefined) return;
    const next: DesignDecision = { ...current };
    for (const [field, value] of Object.entries(patch) as [keyof DesignDecision, unknown][]) {
      if (field === 'nodeIds') {
        const ids = Array.isArray(value) ? (value as string[]) : [];
        if (ids.length === 0) delete next.nodeIds;
        else next.nodeIds = ids;
      } else if (typeof value === 'string' && (field === 'choice' || value.trim() !== '')) {
        next[field] = value;
      } else {
        delete next[field];
      }
    }
    commit(
      { decisions: decisions.map((decision, at) => (at === index ? next : decision)) },
      `narrative:decision:${index}:${Object.keys(patch).join(',')}`,
    );
  },

  removeDecision(index) {
    const { decisions } = get();
    if (decisions[index] === undefined) return;
    commit({ decisions: decisions.filter((_, at) => at !== index) });
  },

  setCriterionNarration(criterionId, prose) {
    const { criterionNarrations } = get();
    const others = criterionNarrations.filter((narration) => narration.criterionId !== criterionId);
    commit(
      {
        criterionNarrations: prose.trim() === '' ? others : [...others, { criterionId, prose }],
      },
      `narrative:narration:${criterionId}`,
    );
  },

  addAssumption() {
    commit({ assumptions: [...get().assumptions, ''] });
  },

  setAssumption(index, text) {
    const { assumptions } = get();
    if (assumptions[index] === undefined) return;
    commit(
      { assumptions: assumptions.map((item, at) => (at === index ? text : item)) },
      `narrative:assumption:${index}`,
    );
  },

  removeAssumption(index) {
    const { assumptions } = get();
    if (assumptions[index] === undefined) return;
    commit({ assumptions: assumptions.filter((_, at) => at !== index) });
  },

  loadNarrative(narrative) {
    set(
      loaded({
        narrativeOverview: narrative?.overview ?? '',
        componentRationales: narrative?.componentRationales ?? [],
        criterionNarrations: narrative?.criterionNarrations ?? [],
        decisions: narrative?.decisions ?? [],
        assumptions: narrative?.assumptions ?? [],
      }),
    );
  },
});
