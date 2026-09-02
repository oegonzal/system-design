import type { CanvasGraph, NodeOperation } from './canvas';

/**
 * One text rendering of a canvas, for every conversation the product has with a
 * model.
 *
 * It lives in contracts because more than one app now has such a conversation:
 * the eval worker's critic, depth and scenario passes, and the API's binding
 * suggestions. Two renderings would mean a node described one way to the critic
 * and another way to the suggester — and the whole point is that node ids and
 * config knobs read identically wherever a model is asked about them, so its
 * answers can be quoted back against the same graph.
 *
 * These are the per-element halves only. Assembling a whole document — which
 * prompt facts to include, what the token budget is — stays with each caller,
 * because those genuinely differ.
 */

/** Budget per node line: enough to judge an interface, not enough to drown the prompt. */
export const MAX_SERIALIZED_OPS = 8;
/** Notes are context, not content — clip them before they dominate the line. */
export const MAX_SERIALIZED_NOTE_LENGTH = 60;

/**
 * `command placeOrder idem (Validates inventory first)` — kind, name, an
 * idempotency marker only when the author stated one either way, clipped
 * notes in parens.
 */
function renderOperation(operation: NodeOperation): string {
  const idempotency =
    typeof operation.idempotent === 'boolean' ? (operation.idempotent ? ' idem' : ' non-idem') : '';
  const fulfills = operation.fulfills !== undefined ? ` fulfills=${operation.fulfills}` : '';
  const emits =
    operation.emits !== undefined && operation.emits.length > 0
      ? ` emits=[${operation.emits.join(',')}]`
      : '';
  const notes =
    operation.notes !== undefined && operation.notes.length > 0
      ? ` (${
          operation.notes.length > MAX_SERIALIZED_NOTE_LENGTH
            ? `${operation.notes.slice(0, MAX_SERIALIZED_NOTE_LENGTH)}…`
            : operation.notes
        })`
      : '';
  return `${operation.kind} ${operation.name}${idempotency}${fulfills}${emits}${notes}`;
}

export function renderNodeLine(node: CanvasGraph['nodes'][number]): string {
  const config = node.config ? ` config=${JSON.stringify(node.config)}` : '';
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
  return `  node ${node.id} kind=${node.kind} label=${JSON.stringify(node.label)}${config}${roles}${ops}`;
}

export function renderEdgeLine(edge: CanvasGraph['edges'][number]): string {
  return `  edge ${edge.id}: ${edge.source} -> ${edge.target} (${edge.kind ?? 'sync'})${
    edge.label ? ` label=${JSON.stringify(edge.label)}` : ''
  }${edge.carries && edge.carries.length > 0 ? ` carries=[${edge.carries.join(',')}]` : ''}`;
}
