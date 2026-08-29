/**
 * The one deterministic text rendering of prompt + canvas that every LLM pass
 * (free critic, depth axis, adversarial scenarios) builds its prompt on. One
 * serializer means one token budget, one elision policy, and node ids the
 * model can quote verbatim across all three conversations.
 */
import type { CanvasGraph, NodeOperation } from '@sysdesign/contracts';

import type { PromptFacts } from '../types';

/** Budget per node line: enough to judge an interface, not enough to drown the prompt. */
const MAX_SERIALIZED_OPS = 8;
/** Notes are context, not content — clip them before they dominate the line. */
const MAX_SERIALIZED_NOTE_LENGTH = 60;
/**
 * Whole-document ceiling. A 100-node canvas with full interfaces stays well
 * under this; anything larger is clipped with a deterministic marker and the
 * pass reports a token-clipped diagnostic so the audit trail says so.
 */
export const GRAPH_TEXT_MAX_CHARS = 24_000;

export interface GraphText {
  text: string;
  clipped: boolean;
}

/**
 * `command placeOrder idem (Validates inventory first)` — kind, name, an
 * idempotency marker only when the author stated one either way, clipped
 * notes in parens.
 */
function renderOperation(operation: NodeOperation): string {
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
  return `${operation.kind} ${operation.name}${idempotency}${notes}`;
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

/**
 * The shared document: the prompt (scale, every NFR with statement and
 * target, functional text) followed by the candidate design. Callers append
 * their own pass-specific sections before sending.
 */
export function describeDesign(graph: CanvasGraph, facts: PromptFacts): GraphText {
  const targets = facts.scaleTargets;
  const nfrs =
    facts.nfrs.length === 0
      ? ['  (none)']
      : facts.nfrs.map(
          (nfr) =>
            `  nfr ${nfr.id} [${nfr.kind}] ${JSON.stringify(nfr.statement)}${
              nfr.target ? ` target ${nfr.target}` : ''
            }${
              nfr.targetSpec
                ? ` spec ${nfr.targetSpec.metric} ${nfr.targetSpec.op} ${nfr.targetSpec.value}${nfr.targetSpec.unit}`
                : ''
            }`,
        );

  const full = [
    `# Design prompt`,
    `archetype: ${facts.archetype} · difficulty: ${facts.difficulty}`,
    `scale: ${targets.concurrentUsers} concurrent users, ${targets.requestsPerSecond} req/s, ` +
      `read:write ${targets.readWriteRatio}, p99 ≤ ${targets.p99LatencyMs}ms, ` +
      `availability ${targets.availabilityPct}%` +
      (targets.dataRetention ? `, retention ${targets.dataRetention}` : ''),
    `non-functional requirements:`,
    ...nfrs,
    `functional requirements: ${facts.functionalText}`,
    ``,
    `# Candidate design (canvas graph)`,
    ...graph.nodes.map(renderNodeLine),
    ...graph.edges.map(renderEdgeLine),
  ].join('\n');

  if (full.length <= GRAPH_TEXT_MAX_CHARS) return { text: full, clipped: false };
  return {
    text: `${full.slice(0, GRAPH_TEXT_MAX_CHARS)}\n  […design clipped for length]`,
    clipped: true,
  };
}
