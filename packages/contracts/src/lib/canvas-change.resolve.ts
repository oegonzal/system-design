import type { CanvasChange } from './canvas-change.schema';
import type { Binding, DesignDecision, DesignSubmission } from './canvas.schema';
import type { ModelEntity } from './model.schema';
import { submissionLocations, type SubmissionPart } from './submission-locations';

/**
 * Every address in a change set resolved against the best. The render the
 * coach reads prints each element as `[node.14] node n-14 …` and the
 * remediations cite the positional id, so a coach writes `node.14` where the
 * author's `n-14` belongs. Measured on the first change-set rounds (arm C,
 * lane run 2026-11-08T22-48-49-342-e4eb2d): edges were upserted with source
 * and target `node.14` and `node.38`, nodes with id `node.5` and `node.12`,
 * and the rounds appended phantom nodes connected to nothing. So a positional
 * id is an address: `node.N` is the id of the best's N-th node, `edge.N` the
 * N-th edge's, `entity.N` the N-th entity's — the numbering is
 * `submissionLocations`', unfiltered, the one the render used — wherever an
 * element is addressed: an upsert's id, an edge's ends, a removal, a
 * binding's nodes, path and entities, a rationale's node, a decision's
 * nodes, an entity's owner, a relation's ends. A ref that is not positional,
 * or a position the best does not have, is left as written and reads
 * downstream as the unknown id it is: an unknown id upserted is a new
 * element, removed is a no-op, at an edge's end is a dangling edge the graph
 * drops. Never a regex over prose: a ref is looked up whole.
 */

/** The parts a change set addresses, by the author's id or by the position the render printed. */
const ADDRESSED_PARTS = ['node', 'edge', 'entity'] as const satisfies readonly SubmissionPart[];
type AddressedPart = (typeof ADDRESSED_PARTS)[number];

const isAddressed = (part: SubmissionPart): part is AddressedPart =>
  (ADDRESSED_PARTS as readonly SubmissionPart[]).includes(part);

/** A ref as the author's id: itself, or the id at the position it names. */
type Resolve = (ref: string) => string;
type Addresses = Record<AddressedPart, Resolve>;

/** What each positional id of the best names, per part: `node.14` → the id of its 14th node. */
function addressesOf(best: DesignSubmission): Addresses {
  const keyByPosition = new Map<AddressedPart, Map<string, string>>(
    ADDRESSED_PARTS.map((part) => [part, new Map()]),
  );
  for (const location of submissionLocations(best)) {
    if (isAddressed(location.part) && location.key !== null) {
      keyByPosition.get(location.part)?.set(location.id, location.key);
    }
  }
  const resolve =
    (part: AddressedPart): Resolve =>
    (ref) =>
      keyByPosition.get(part)?.get(ref) ?? ref;
  return { node: resolve('node'), edge: resolve('edge'), entity: resolve('entity') };
}

const resolvedEntity = ({ node, entity }: Addresses, item: ModelEntity): ModelEntity => ({
  ...item,
  id: entity(item.id),
  ...(item.ownerNodeId === undefined ? {} : { ownerNodeId: node(item.ownerNodeId) }),
});

const resolvedBinding = ({ node, edge, entity }: Addresses, item: Binding): Binding => ({
  ...item,
  nodeIds: item.nodeIds.map(node),
  ...(item.path && { path: item.path.map(edge) }),
  ...(item.entityIds && { entityIds: item.entityIds.map(entity) }),
});

const resolvedDecision = ({ node }: Addresses, item: DesignDecision): DesignDecision =>
  item.nodeIds === undefined ? item : { ...item, nodeIds: item.nodeIds.map(node) };

/** The change set with every address an author's id; a part the change does not name stays unnamed. */
export function resolveChangeAddresses(best: DesignSubmission, change: CanvasChange): CanvasChange {
  const at = addressesOf(best);
  const { changes } = change;
  const resolved: CanvasChange['changes'] = { ...changes };
  if (changes.nodes !== undefined) {
    resolved.nodes = {
      upsert: changes.nodes.upsert.map((item) => ({ ...item, id: at.node(item.id) })),
      remove: changes.nodes.remove.map(at.node),
    };
  }
  if (changes.edges !== undefined) {
    resolved.edges = {
      upsert: changes.edges.upsert.map((item) => ({
        ...item,
        id: at.edge(item.id),
        source: at.node(item.source),
        target: at.node(item.target),
      })),
      remove: changes.edges.remove.map(at.edge),
    };
  }
  if (changes.entities !== undefined) {
    resolved.entities = {
      upsert: changes.entities.upsert.map((item) => resolvedEntity(at, item)),
      remove: changes.entities.remove.map(at.entity),
    };
  }
  if (changes.relations !== undefined) {
    resolved.relations = {
      replace: changes.relations.replace.map((item) => ({
        ...item,
        from: at.entity(item.from),
        to: at.entity(item.to),
      })),
    };
  }
  if (changes.bindings !== undefined) {
    resolved.bindings = {
      upsert: changes.bindings.upsert.map((item) => resolvedBinding(at, item)),
      remove: changes.bindings.remove,
    };
  }
  if (changes.rationales !== undefined) {
    resolved.rationales = {
      upsert: changes.rationales.upsert.map((item) => ({ ...item, nodeId: at.node(item.nodeId) })),
      remove: changes.rationales.remove.map(at.node),
    };
  }
  if (changes.decisions !== undefined) {
    resolved.decisions = {
      upsertAt: changes.decisions.upsertAt.map(({ at: position, decision }) => ({
        at: position,
        decision: resolvedDecision(at, decision),
      })),
      removeAt: changes.decisions.removeAt,
      append: changes.decisions.append.map((item) => resolvedDecision(at, item)),
    };
  }
  return { changes: resolved };
}
