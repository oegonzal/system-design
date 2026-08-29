import type { NodeOperation } from '@sysdesign/contracts';

import type { CriticInput } from './eval-critic';

export const CRITIC_SYSTEM_PROMPT = [
  'You are a principal engineer reviewing a system-design exercise on an',
  'architecture canvas. Your job is to teach: point out what the deterministic',
  'rule engine cannot see — misplaced responsibilities, missing failure',
  'stories, consistency traps, operational blind spots — grounded in the',
  "prompt's stated scale. Be concrete and reference node ids. Never restate a",
  'finding the rule engine already made. If the design is genuinely sound,',
  'return no findings and say so in the summary.',
  "Declared responsibilities, operations and carries are the author's",
  'interface contracts — critique missing, misplaced or leaky responsibilities',
  "against them, never restating the rule engine's findings.",
].join(' ');

/** Budget per node line: enough to judge an interface, not enough to drown the prompt. */
const MAX_SERIALIZED_OPS = 8;
/** Notes are context, not content — clip them before they dominate the line. */
const MAX_SERIALIZED_NOTE_LENGTH = 60;

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

/**
 * Compact, deterministic text rendering of the canvas + prompt + what the
 * engine already found. Line-oriented so the model can quote node ids
 * verbatim.
 */
export function buildCriticUserPrompt({
  graph,
  facts,
  deterministicFindings,
}: CriticInput): string {
  const nodes = graph.nodes.map((node) => {
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
  });

  const edges = graph.edges.map(
    (edge) =>
      `  edge ${edge.id}: ${edge.source} -> ${edge.target} (${edge.kind ?? 'sync'})${
        edge.label ? ` label=${JSON.stringify(edge.label)}` : ''
      }${edge.carries && edge.carries.length > 0 ? ` carries=[${edge.carries.join(',')}]` : ''}`,
  );

  const alreadyFound =
    deterministicFindings.length === 0
      ? '  (none)'
      : deterministicFindings
          .map((f) => `  [${f.severity}] ${f.ruleId ?? f.expectationId ?? 'finding'}: ${f.title}`)
          .join('\n');

  const targets = facts.scaleTargets;

  return [
    `# Design prompt`,
    `archetype: ${facts.archetype} · difficulty: ${facts.difficulty}`,
    `scale: ${targets.concurrentUsers} concurrent users, ${targets.requestsPerSecond} req/s, ` +
      `read:write ${targets.readWriteRatio}, p99 ≤ ${targets.p99LatencyMs}ms, ` +
      `availability ${targets.availabilityPct}%`,
    `functional requirements: ${facts.functionalText}`,
    ``,
    `# Candidate design (canvas graph)`,
    ...nodes,
    ...edges,
    ``,
    `# Already found by the rule engine (do not repeat)`,
    alreadyFound,
  ].join('\n');
}
