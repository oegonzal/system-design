import { NODE_MAX_OPERATIONS } from './canvas';
import type { CanvasEdge, CanvasNode, NodeOperation } from './canvas.schema';
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
 * Every operation a node may declare is printed. Pinned to the schema's own cap
 * so the two cannot drift: a lens is asked which declarations no edge exercises,
 * and it can only answer about the ones it was shown. An edge's `carries` is
 * never elided either, so eliding a node's operations would read as "carried but
 * never declared" — a defect the author did not commit. The whole-graph budget
 * `CANVAS_MAX_TOTAL_OPERATIONS` is what keeps a prompt in bounds, and a
 * blocking validator enforces it.
 */
export const MAX_SERIALIZED_OPS = NODE_MAX_OPERATIONS;
/** Notes are context, not content — clip them before they dominate the line. */
export const MAX_SERIALIZED_NOTE_LENGTH = 60;

/**
 * `command placeOrder idem (Validates inventory first)` — kind when stated,
 * name, an idempotency marker only when the author stated one either way,
 * clipped notes in parens.
 */
function renderOperation(operation: NodeOperation): string {
  const kind = operation.kind !== undefined ? `${operation.kind} ` : '';
  const idempotency =
    typeof operation.idempotent === 'boolean' ? (operation.idempotent ? ' idem' : ' non-idem') : '';
  const notes =
    operation.notes !== undefined && operation.notes.length > 0
      ? ` (${
          operation.notes.length > MAX_SERIALIZED_NOTE_LENGTH
            ? `${operation.notes.slice(0, MAX_SERIALIZED_NOTE_LENGTH)}…`
            : operation.notes
        })`
      : '';
  return `${kind}${operation.name}${idempotency}${notes}`;
}

export function renderNodeLine(node: CanvasNode): string {
  const config =
    node.config && node.config.length > 0
      ? ` config=${JSON.stringify(Object.fromEntries(node.config.map((entry) => [entry.key, entry.value])))}`
      : '';
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
  return `  node ${node.id} kind=${node.kind} label=${JSON.stringify(nodeLabel(node))}${config}${roles}${ops}`;
}

export function renderEdgeLine(edge: CanvasEdge): string {
  return `  edge ${edge.id}: ${edge.source} -> ${edge.target} (${edge.kind})${
    edge.label ? ` label=${JSON.stringify(edge.label)}` : ''
  }${edge.carries && edge.carries.length > 0 ? ` carries=[${edge.carries.join(',')}]` : ''}`;
}
