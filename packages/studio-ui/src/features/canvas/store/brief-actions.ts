import { BINDING_NODES_BOUND, type Binding } from '@sysdesign/contracts';

import type { ActionDeps } from './history';
import type { CanvasState } from './state';

/** A binding with nothing in it is not kept — the row reads `empty` again. */
function isBlank(binding: Binding): boolean {
  return (
    binding.claim.trim().length === 0 &&
    binding.nodeIds.length === 0 &&
    (binding.path ?? []).length === 0 &&
    (binding.tradeoff ?? '').trim().length === 0
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

export type BriefActions = Pick<
  CanvasState,
  | 'setBindingClaim'
  | 'setBindingTradeoff'
  | 'toggleBindingNode'
  | 'setBindingPath'
  | 'clearBinding'
  | 'loadBrief'
>;

/** The design brief: per criterion, the blocks and the walk the author binds it to, and the claim in their words. */
export const briefActions = ({
  set,
  get,
  edits: { commit, loaded },
}: ActionDeps): BriefActions => ({
  setBindingClaim(criterionId, claim) {
    commit(
      { bindings: upsert(get().bindings, criterionId, (current) => ({ ...current, claim })) },
      `binding:${criterionId}:claim`,
    );
  },

  setBindingTradeoff(criterionId, tradeoff) {
    commit(
      {
        bindings: upsert(get().bindings, criterionId, (current) => {
          const { tradeoff: _dropped, ...rest } = current;
          return tradeoff.trim() === '' ? rest : { ...rest, tradeoff };
        }),
      },
      `binding:${criterionId}:tradeoff`,
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
        nodeIds: has ? current.nodeIds.filter((id) => id !== nodeId) : [...current.nodeIds, nodeId],
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
          ...(current.tradeoff !== undefined ? { tradeoff: current.tradeoff } : {}),
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
});
