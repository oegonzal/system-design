/**
 * The depth axis: an LLM grades how deeply the design addresses the hard
 * problems of its archetype — by mechanism, not by box. The score is an
 * AxisArtifact the aggregator carries through untouched: displayed beside the
 * deterministic grade, structurally unable to move it.
 */
import { describeDesign } from '../../serialization/graph-text';
import type { EvalPass } from '../../core/types';
import { coverageSection, findingsSection } from '../deterministic-sections';
import { DEPTH_AXIS_ID, DEPTH_AXIS_LABEL, depthSchema } from './depth-schema';

export const DEPTH_PASS_ID = 'llm.depth';

const SYSTEM_PROMPT = [
  'You are a principal engineer grading the DEPTH of a system-design exercise.',
  'The deterministic engine has already graded coverage — its checklist is',
  'included so you grade BEYOND it: does the design address the hard problems',
  'of this archetype by mechanism rather than by dropping a box? Judge',
  'trade-off articulation (labels, configs and declared operations that show',
  'the author chose, not defaulted), bottleneck awareness, failure design, and',
  'data-flow clarity. When operations or carries are declared, also grade the',
  'contracts themselves — operation granularity, command/query/event/stream',
  'fit, idempotency choices, and how tightly callers couple to each surface.',
  'Score 0–100 on each; be strict — 80+ means you would',
  'ship this review as a strong-hire signal. Keep the summary to what the',
  'author should deepen next.',
].join(' ');

export function createDepthPass(): EvalPass {
  return {
    id: DEPTH_PASS_ID,
    mode: 'llm',
    run: async (ctx) => {
      if (!ctx.llm.enabled) {
        return [
          {
            passId: DEPTH_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-disabled',
            detail: null,
          },
        ];
      }

      const design = describeDesign(ctx.graph, ctx.facts, ctx.narrative);
      const critique = await ctx.llm.completeStructured({
        system: SYSTEM_PROMPT,
        user: [
          design.text,
          ``,
          `# Deterministic coverage (grade beyond this checklist)`,
          coverageSection(ctx),
          ``,
          `# Deterministic findings`,
          findingsSection(ctx),
        ].join('\n'),
        schema: depthSchema,
        maxTokens: 2048,
      });

      if (critique === null) {
        return [
          {
            passId: DEPTH_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-failed',
            detail: null,
          },
        ];
      }

      return [
        {
          passId: DEPTH_PASS_ID,
          kind: 'axis',
          axisId: DEPTH_AXIS_ID,
          label: DEPTH_AXIS_LABEL,
          score: critique.depthScore,
          subScores: critique.subScores,
          factors: null,
          summary: critique.summary.trim() || null,
          model: ctx.llm.model,
        },
        ...(design.clipped
          ? [
              {
                passId: DEPTH_PASS_ID,
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
