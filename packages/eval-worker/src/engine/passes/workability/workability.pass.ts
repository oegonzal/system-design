/**
 * The workability axis: an LLM evaluator asks what the evidence implies
 * about the BUSINESS — objective alignment, completeness, feasibility,
 * remaining risk, future gain — as ordinal factor judgements with
 * rationales. Advisory by construction: `mode: 'llm'` means enforceMode
 * would drop any findings or coverage it tried to emit, and axes never
 * enter the score math.
 *
 * Runs only when the prompt carries a workflow spec: on a scale-only prompt
 * there is no stated business layer to judge, and commentary about one would
 * be the evaluator grading requirements the prompt never made.
 */
import { describeDesign } from '../../serialization/graph-text';
import type { GradedEvidenceItem } from '../../core/artifacts';
import type { EvalPass } from '../../core/types';
import { judgeGraphWorkflow } from '../../workflows';
import { coverageSection, findingsSection } from '../deterministic-sections';
import {
  admitGrounding,
  nodeIdSet,
  SEVERITY_FROM_LEVEL,
  workflowItemIds,
} from '../graded-grounding';
import {
  WORKABILITY_AXIS_ID,
  WORKABILITY_AXIS_LABEL,
  buildWorkabilitySchema,
  factorsToDisplay,
  FACTOR_DIMENSION,
  type WorkabilityCritique,
} from './workability-schema';

export const WORKABILITY_PASS_ID = 'llm.workability';

/**
 * The evaluator's grounded shortfalls → graded evidence. The lens (factor) maps
 * to a dimension by the engine's fixed map; the model reports the weakness
 * MAGNITUDE directly (no inversion), so the currency matches the critic's. Every
 * grounding is re-checked against the real workflow items and nodes.
 */
function weaknessesToGraded(
  critique: WorkabilityCritique,
  knownItems: ReadonlySet<string>,
  knownNodes: ReadonlySet<string>,
): GradedEvidenceItem[] {
  return critique.weaknesses.map((weakness) => {
    const grounding = admitGrounding(
      weakness.requirementId,
      weakness.affectedComponents,
      knownItems,
      knownNodes,
    );
    return {
      dimension: FACTOR_DIMENSION[weakness.factor],
      level: weakness.weakness,
      confidence: weakness.confidence,
      severity: SEVERITY_FROM_LEVEL[weakness.weakness],
      requirementId: grounding.requirementId,
      affectedNodeIds: grounding.affectedNodeIds,
      rationale: `${weakness.factor}: ${weakness.rationale.trim()}`,
      suggestion: null,
    };
  });
}

const SYSTEM_PROMPT = [
  'You are a product-minded principal engineer judging whether this system',
  'design would WORK AS A BUSINESS, not just scale. The deterministic engine',
  'has already checked existence — its workflow verdict ledger is included, so',
  'judge BEYOND it: is the declared workflow the RIGHT workflow? Assess each',
  'factor as none/low/medium/high with a rationale grounded in the diagram and',
  'declarations: objectiveAlignment (does the design serve the stated business',
  'objective), completeness (contracts, lifecycles, events beyond the',
  'checklist), feasibility (would the declared workflow actually run as',
  'drawn), risk (how much business risk REMAINS unmitigated — high means',
  'exposed), futureGain (what headroom this modelling buys later). Be strict;',
  'quote node ids. Keep the summary to what the author should fix first.',
].join(' ');

export function createWorkabilityPass(): EvalPass {
  return {
    id: WORKABILITY_PASS_ID,
    mode: 'llm',
    run: async (ctx) => {
      const spec = ctx.facts.workflow;
      if (spec === null) {
        return [
          {
            passId: WORKABILITY_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'not-applicable',
            detail: 'the prompt carries no workflow spec',
          },
        ];
      }
      if (!ctx.llm.enabled) {
        return [
          {
            passId: WORKABILITY_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-disabled',
            detail: null,
          },
        ];
      }

      const design = describeDesign(ctx.graph, ctx.facts, ctx.narrative);
      const report = judgeGraphWorkflow(ctx.index, spec);
      const ledger = (report?.items ?? [])
        .map(
          (item) =>
            `  [${item.status}${item.gaps.length > 0 ? `: ${item.gaps.join(',')}` : ''}] ${item.itemId}`,
        )
        .join('\n');

      const critique = await ctx.llm.completeStructured({
        system: SYSTEM_PROMPT,
        user: [
          design.text,
          ``,
          `# Deterministic workflow verdicts (existence is already graded — judge beyond)`,
          ledger || '  (none)',
          ``,
          `# Deterministic coverage (grade beyond this checklist)`,
          coverageSection(ctx),
          ``,
          `# Deterministic findings`,
          findingsSection(ctx),
        ].join('\n'),
        schema: buildWorkabilitySchema(ctx.graph, spec),
        maxTokens: 2048,
      });

      if (critique === null) {
        return [
          {
            passId: WORKABILITY_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-failed',
            detail: null,
          },
        ];
      }

      const display = factorsToDisplay(critique);
      const items = weaknessesToGraded(
        critique,
        new Set(workflowItemIds(spec)),
        nodeIdSet(ctx.graph),
      );
      return [
        {
          passId: WORKABILITY_PASS_ID,
          kind: 'axis',
          axisId: WORKABILITY_AXIS_ID,
          label: WORKABILITY_AXIS_LABEL,
          score: display.score,
          subScores: display.subScores,
          factors: display.factors,
          summary: critique.summary.trim() || null,
          model: ctx.llm.model,
        },
        // The grounded shortfalls score; the axis above stays advisory display.
        ...(items.length > 0
          ? [
              {
                passId: WORKABILITY_PASS_ID,
                kind: 'graded-evidence' as const,
                lens: 'evaluator.workability',
                items,
                summary: null,
                model: ctx.llm.model,
              },
            ]
          : []),
        ...(design.clipped
          ? [
              {
                passId: WORKABILITY_PASS_ID,
                kind: 'diagnostics' as const,
                skipped: false,
                reason: 'token-clipped' as const,
                detail: 'design text exceeded the serialization budget',
              },
            ]
          : []),
      ];
    },
  };
}
