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

/**
 * Whole-document ceiling. A 100-node canvas with full interfaces stays well
 * under this; anything larger is clipped with a deterministic marker and the
 * pass reports a token-clipped diagnostic so the audit trail says so.
 */
export const GRAPH_TEXT_MAX_CHARS = 24_000;
const NARRATIVE_HEADER = ['', `# Design narrative (the author's own explanation)`];
const NARRATIVE_CLIPPED = ' […narrative clipped]';

/**
 * The narrative rides whole as long as the document fits; only when it does
 * not does the graph win the budget and the story lose its tail. A flat 2k
 * ceiling used to sit here regardless of room, which cut a contract-sized
 * structured narrative (1.2k overview + 600 per component) after the fifth
 * component — so the critics charged authors for prose they were never shown.
 */
function narrativeSection(story: string, room: number): string[] {
  if (story.length === 0) return [];
  if (story.length <= room) return [...NARRATIVE_HEADER, story];
  const keep = Math.max(0, room - NARRATIVE_CLIPPED.length);
  return [...NARRATIVE_HEADER, `${story.slice(0, keep)}${NARRATIVE_CLIPPED}`];
}

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

  const design = [
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
  ].join('\n');

  const room = GRAPH_TEXT_MAX_CHARS - design.length - NARRATIVE_HEADER.join('\n').length - 2;
  const full = [design, ...narrativeSection(narrative?.trim() ?? '', room)].join('\n');

  if (full.length <= GRAPH_TEXT_MAX_CHARS) return { text: full, clipped: false };
  return {
    text: `${full.slice(0, GRAPH_TEXT_MAX_CHARS)}\n  […design clipped for length]`,
    clipped: true,
  };
}
