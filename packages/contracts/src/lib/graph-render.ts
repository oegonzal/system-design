import { NODE_OPERATIONS_BOUND, OPERATION_NOTES_BOUND } from './canvas';
import type { CanvasEdge, CanvasNode, ConfigEntry, NodeOperation } from './canvas.schema';
import { nodeLabel } from './node-label';

/**
 * One text rendering of a canvas, for every conversation the product has with
 * a model. It lives in contracts because more than one thing reads it — the
 * quality loop's canvas pipeline renders the artifact its lenses judge with
 * these lines, and any future model-facing text does too — and the whole
 * point is that node ids and config entries read identically wherever a model
 * is asked about them, so its answers can be quoted back against the same
 * graph. These are the per-element halves only; assembling a document is the
 * caller's.
 */

/**
 * Every operation a node may declare is printed. Pinned to what the schema
 * accepts — its bound's ceiling — so the two cannot drift: a lens is asked which declarations no edge exercises,
 * and it can only answer about the ones it was shown. An edge's `carries` is
 * never elided either, so eliding a node's operations would read as "carried but
 * never declared" — a defect the author did not commit. The whole-graph budget
 * `CANVAS_MAX_TOTAL_OPERATIONS` is what keeps a prompt in bounds, and a
 * blocking validator enforces it.
 */
export const MAX_SERIALIZED_OPS = NODE_OPERATIONS_BOUND.ceiling;
/**
 * A note is printed whole. It is where an author states the contract of an
 * operation — its retry, its ordering, its acknowledgement — and a lens that
 * reads half of one reports the other half missing; the coach, which revises
 * from this same text, would hand back the half it was shown. Pinned to what
 * the schema accepts for the reason the operation cap is: the render never
 * cuts what the schema admits.
 */
export const MAX_SERIALIZED_NOTE_LENGTH = OPERATION_NOTES_BOUND.ceiling;

/**
 * `command placeOrder idem note="Validates inventory first"` — kind when
 * stated, name, an idempotency marker only when the author stated one either
 * way, and the note quoted as a label is, so its own punctuation never reads
 * as the end of the operation. Past the schema's bound — a length no valid
 * submission has — the note is cut and says so.
 */
function renderOperation(operation: NodeOperation): string {
  const kind = operation.kind !== undefined ? `${operation.kind} ` : '';
  const idempotency =
    typeof operation.idempotent === 'boolean' ? (operation.idempotent ? ' idem' : ' non-idem') : '';
  const written = operation.notes ?? '';
  const shown =
    written.length > MAX_SERIALIZED_NOTE_LENGTH
      ? `${written.slice(0, MAX_SERIALIZED_NOTE_LENGTH)}…`
      : written;
  const notes = shown.length > 0 ? ` note=${JSON.stringify(shown)}` : '';
  return `${kind}${operation.name}${idempotency}${notes}`;
}

/** ` config={"replicas":3}` — the entries as one object, or nothing when none were set; the same on a node and on an edge. */
const renderConfig = (entries: readonly ConfigEntry[] | undefined): string =>
  entries && entries.length > 0
    ? ` config=${JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.key, entry.value])))}`
    : '';

export function renderNodeLine(node: CanvasNode): string {
  const service = node.service !== undefined ? ` service=${node.service}` : '';
  const boundary = node.boundary !== undefined ? ` boundary=${JSON.stringify(node.boundary)}` : '';
  const config = renderConfig(node.config);
  const roles =
    node.responsibilities && node.responsibilities.length > 0
      ? ` roles=[${node.responsibilities.join('|')}]`
      : '';
  const declared = node.operations ?? [];
  const shown = declared.slice(0, MAX_SERIALIZED_OPS);
  const elided = declared.length - shown.length;
  const ops =
    shown.length > 0
      ? ` ops=[${shown.map(renderOperation).join('; ')}${elided > 0 ? `; …+${elided} more` : ''}]`
      : '';
  return `  node ${node.id} kind=${node.kind}${service} label=${JSON.stringify(nodeLabel(node))}${boundary}${config}${roles}${ops}`;
}

export function renderEdgeLine(edge: CanvasEdge): string {
  return `  edge ${edge.id}: ${edge.source} -> ${edge.target} (${edge.kind})${
    edge.label ? ` label=${JSON.stringify(edge.label)}` : ''
  }${renderConfig(edge.config)}${edge.carries && edge.carries.length > 0 ? ` carries=[${edge.carries.join(',')}]` : ''}`;
}
