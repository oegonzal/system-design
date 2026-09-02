/**
 * The one deterministic text rendering of prompt + canvas that every LLM pass
 * (free critic, depth axis, adversarial scenarios) builds its prompt on. One
 * serializer means one token budget, one elision policy, and node ids the
 * model can quote verbatim across all three conversations.
 */
import { renderEdgeLine, renderNodeLine, type CanvasGraph } from '@sysdesign/contracts';

import type { PromptFacts } from '../types';

// The per-element renderers live in contracts: the API's binding suggester
// describes a canvas to a model too, and both must describe it identically.
export { renderEdgeLine, renderNodeLine };

/** The narrative rides along whole up to this; beyond it, the graph wins the budget. */
const MAX_SERIALIZED_NARRATIVE_CHARS = 2_000;
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
 * The shared document: the prompt (scale, every NFR with statement and
 * target, functional text) followed by the candidate design and — when the
 * author submitted one — the design narrative, so every LLM pass reads the
 * same story. Callers append their own pass-specific sections before sending.
 */
export function describeDesign(
  graph: CanvasGraph,
  facts: PromptFacts,
  narrative: string | null = null,
): GraphText {
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

  const story = narrative?.trim() ?? '';
  const narrativeSection =
    story.length === 0
      ? []
      : [
          ``,
          `# Design narrative (the author's own explanation)`,
          story.length > MAX_SERIALIZED_NARRATIVE_CHARS
            ? `${story.slice(0, MAX_SERIALIZED_NARRATIVE_CHARS)} […narrative clipped]`
            : story,
        ];

  const workflow = facts.workflow;
  const workflowSection =
    workflow === null
      ? []
      : [
          ``,
          `# Workflow spec (the business layer; ops reference these ids via fulfills/emits)`,
          ...workflow.operations.map(
            (op) =>
              `  operation ${op.id} [${op.kind}] ${JSON.stringify(op.statement)}` +
              `${op.emits?.length ? ` emits=[${op.emits.join(',')}]` : ''}` +
              `${op.onFailureEmits?.length ? ` onFailure=[${op.onFailureEmits.join(',')}]` : ''}`,
          ),
          ...workflow.events.map(
            (event) => `  event ${event.id} ${JSON.stringify(event.statement)}`,
          ),
          ...workflow.ingests.map(
            (ingest) =>
              `  ingest ${ingest.id} [${ingest.mode}] ${JSON.stringify(ingest.statement)} ` +
              `budget-nfr=${ingest.nfrId} emits=[${ingest.emits.join(',')}]`,
          ),
          ...workflow.aggregations.map(
            (agg) =>
              `  aggregation ${agg.id} ${JSON.stringify(agg.statement)} sources=[${agg.sourceEventIds.join(',')}]`,
          ),
          ...workflow.entities.map(
            (entity) =>
              `  entity ${entity.id} ${JSON.stringify(entity.name)} states=[${entity.states.join(',')}] ` +
              `transitions=[${entity.transitions
                .map((t) => `${t.from ?? '·'}->${t.to} via ${t.via}`)
                .join('; ')}]`,
          ),
        ];

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
    ...workflowSection,
    ``,
    `# Candidate design (canvas graph)`,
    ...graph.nodes.map(renderNodeLine),
    ...graph.edges.map(renderEdgeLine),
    ...narrativeSection,
  ].join('\n');

  if (full.length <= GRAPH_TEXT_MAX_CHARS) return { text: full, clipped: false };
  return {
    text: `${full.slice(0, GRAPH_TEXT_MAX_CHARS)}\n  […design clipped for length]`,
    clipped: true,
  };
}
