import type { CanvasChange } from './canvas-change.schema';
import {
  DESIGN_BRIEF_VERSION,
  NARRATION_VERSION,
  type CanvasGraph,
  type CanvasNode,
  type DesignBrief,
  type DesignNarrative,
  type DesignSubmission,
} from './canvas.schema';
import { DESIGN_MODEL_VERSION, type DesignModel } from './model.schema';

/**
 * The best revision with a change set applied: what the loop stores and
 * judges after a revise, so the lenses, the studio and the record never see
 * a change set. Pure and total over a parsed change — it never throws,
 * invents or repairs.
 *
 * Per keyed list, in order: upserts — a known key replaces its item IN
 * PLACE, so the positional ids of untouched elements keep their numbers and
 * last round's citations still land; a new key is appended; a later upsert
 * for one key wins — then removals by key, then the cascade: every edge
 * touching a removed node goes with it, as the studio's `removeElements`
 * drops them, an edge this change set added included. A removal naming
 * nothing on the canvas is a no-op.
 *
 * A container appears only when the change touches it — a brief for a first
 * binding, a narrative for a first overview, a model for a first entity —
 * with its version literal; a change touching no part of the model leaves
 * `model` exactly as the best had it, absent included. A positional list is
 * replaced whole when named and the overview set when named, an empty value
 * clearing either. What a removal leaves dangling — a binding naming a
 * removed node, a relation to a removed entity — is `repairSubmission`'s to
 * drop, as it drops the editor's; a fault of the graph itself stays for the
 * `references` validator to refuse. The transcript is the studio's, copied
 * from the best.
 */
export function applyCanvasChange(best: DesignSubmission, change: CanvasChange): DesignSubmission {
  const { changes } = change;
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

/** What a keyed list is changed by: items to add or rewrite, and keys to remove. */
interface KeyedChanges<Item> {
  upsert: readonly Item[];
  remove: readonly string[];
}

const byId = (item: { id: string }): string => item.id;

/** A keyed list after its changes: known keys replaced in place, new keys appended, a later upsert for one key winning, then the removals. */
function appliedKeyed<Item>(
  items: Item[],
  changes: KeyedChanges<Item> | undefined,
  keyOf: (item: Item) => string,
): Item[] {
  if (changes === undefined) return items;
  const next = [...items];
  const indexByKey = new Map(next.map((item, index) => [keyOf(item), index]));
  for (const item of changes.upsert) {
    const index = indexByKey.get(keyOf(item));
    if (index === undefined) indexByKey.set(keyOf(item), next.push(item) - 1);
    else next[index] = item;
  }
  const removed = new Set(changes.remove);
  return next.filter((item) => !removed.has(keyOf(item)));
}

/** A node rewritten without a position keeps the one the best had for its id: the coach may omit it, and the studio laid the node out already. */
function placedAsBest(nodes: readonly CanvasNode[], node: CanvasNode): CanvasNode {
  if (node.position !== undefined) return node;
  const position = nodes.find((placed) => placed.id === node.id)?.position;
  return position === undefined ? node : { ...node, position };
}

function appliedGraph(graph: CanvasGraph, { nodes, edges }: Changes): CanvasGraph {
  if (nodes === undefined && edges === undefined) return graph;
  const nodeChanges =
    nodes === undefined
      ? undefined
      : {
          upsert: nodes.upsert.map((node) => placedAsBest(graph.nodes, node)),
          remove: nodes.remove,
        };
  const removedNodes = new Set(nodes?.remove ?? []);
  return {
    nodes: appliedKeyed(graph.nodes, nodeChanges, byId),
    edges: appliedKeyed(graph.edges, edges, byId).filter(
      (edge) => !removedNodes.has(edge.source) && !removedNodes.has(edge.target),
    ),
  };
}

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
  // A part the change names reads as the change says; an empty value is the
  // part removed, so the key goes rather than holding nothing.
  if (overview !== undefined) {
    if (overview.length === 0) delete next.overview;
    else next.overview = overview;
  }
  if (decisions !== undefined) {
    if (decisions.replace.length === 0) delete next.decisions;
    else next.decisions = decisions.replace;
  }
  if (assumptions !== undefined) {
    if (assumptions.replace.length === 0) delete next.assumptions;
    else next.assumptions = assumptions.replace;
  }
  return next;
}
