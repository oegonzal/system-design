import { appliedGraph } from './canvas-change.graph';
import { appliedIndexed, appliedKeyed } from './canvas-change.lists';
import { resolveChangeAddresses } from './canvas-change.resolve';
import type { CanvasChange } from './canvas-change.schema';
import {
  DESIGN_BRIEF_VERSION,
  NARRATION_VERSION,
  type DesignBrief,
  type DesignNarrative,
  type DesignSubmission,
} from './canvas.schema';
import { DESIGN_MODEL_VERSION, type DesignModel } from './model.schema';

/**
 * The best revision with a change set applied: what the loop stores and
 * judges after a revise, so the lenses, the studio and the record never see
 * a change set. Pure and total over a parsed change — it never throws,
 * invents or refuses; a coach's slip costs the slip, never the round.
 *
 * In order: every address is resolved against the best
 * (`canvas-change.resolve.ts`: `node.14` is the 14th node's id); each keyed
 * list is edited by key and each indexed list by position
 * (`canvas-change.lists.ts`: in place, so untouched elements keep their
 * numbers and last round's citations still land); and the graph is wired
 * (`canvas-change.graph.ts`: the node→edge cascade, a dangling edge or a
 * self-loop dropped, an undeclared carry dropped from its edge, a repeated
 * hop read as the kept edge it repeats).
 *
 * A container appears only when the change touches it — a brief for a first
 * binding, a narrative for a first overview, a model for a first entity —
 * with its version literal; a change touching no part of the model leaves
 * `model` exactly as the best had it, absent included. Relations, which the
 * render numbers nowhere, are replaced whole when named; the overview is set
 * when named; an empty value clears either, and a decisions or assumptions
 * list edited down to nothing goes the same way. What a removal leaves
 * dangling elsewhere — a binding naming a removed node, a relation to a
 * removed entity — is `repairSubmission`'s to drop, as it drops the editor's.
 * The transcript is the studio's, copied from the best.
 */
export function applyCanvasChange(best: DesignSubmission, change: CanvasChange): DesignSubmission {
  const { changes } = resolveChangeAddresses(best, change);
  const model = appliedModel(best.model, changes);
  return {
    graph: appliedGraph(best.graph, changes),
    brief: appliedBrief(best.brief, changes),
    narrative: appliedNarrative(best.narrative, changes),
    ...(model === undefined ? {} : { model }),
    ...(best.transcript === undefined ? {} : { transcript: best.transcript }),
  };
}

type Changes = CanvasChange['changes'];

const byId = (item: { id: string }): string => item.id;

function appliedBrief(brief: DesignBrief | null, { bindings }: Changes): DesignBrief | null {
  if (bindings === undefined) return brief;
  return {
    version: DESIGN_BRIEF_VERSION,
    bindings: appliedKeyed(brief?.bindings ?? [], bindings, (binding) => binding.criterionId),
  };
}

function appliedModel(
  model: DesignModel | null | undefined,
  { entities, relations }: Changes,
): DesignModel | null | undefined {
  if (entities === undefined && relations === undefined) return model;
  return {
    version: DESIGN_MODEL_VERSION,
    entities: appliedKeyed(model?.entities ?? [], entities, byId),
    relations: relations?.replace ?? model?.relations ?? [],
  };
}

function appliedNarrative(
  narrative: DesignNarrative | null,
  { rationales, narrations, decisions, assumptions, overview }: Changes,
): DesignNarrative | null {
  if (
    rationales === undefined &&
    narrations === undefined &&
    decisions === undefined &&
    assumptions === undefined &&
    overview === undefined
  ) {
    return narrative;
  }
  const next: DesignNarrative = {
    ...(narrative ?? {
      version: NARRATION_VERSION,
      componentRationales: [],
      criterionNarrations: [],
    }),
  };
  next.componentRationales = appliedKeyed(
    next.componentRationales,
    rationales,
    (rationale) => rationale.nodeId,
  );
  next.criterionNarrations = appliedKeyed(
    next.criterionNarrations,
    narrations,
    (narration) => narration.criterionId,
  );
  // A part the change names reads as the change says; a part edited down to
  // nothing is the part removed, so the key goes rather than holding nothing.
  if (overview !== undefined) {
    if (overview.length === 0) delete next.overview;
    else next.overview = overview;
  }
  if (decisions !== undefined) {
    const kept = appliedIndexed(next.decisions ?? [], {
      upsertAt: decisions.upsertAt.map(({ at, decision }) => ({ at, item: decision })),
      removeAt: decisions.removeAt,
      append: decisions.append,
    });
    if (kept.length === 0) delete next.decisions;
    else next.decisions = kept;
  }
  if (assumptions !== undefined) {
    const kept = appliedIndexed(next.assumptions ?? [], {
      upsertAt: assumptions.upsertAt.map(({ at, text }) => ({ at, item: text })),
      removeAt: assumptions.removeAt,
      append: assumptions.append,
    });
    if (kept.length === 0) delete next.assumptions;
    else next.assumptions = kept;
  }
  return next;
}
