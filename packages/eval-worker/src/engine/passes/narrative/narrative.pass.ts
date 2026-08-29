/**
 * The narrative axis: an LLM grades how well the author's prose explains the
 * diagram it was submitted with — alignment, not eloquence. The score is an
 * AxisArtifact the aggregator carries through untouched: displayed beside the
 * deterministic grade, structurally unable to move it. Without a narrative
 * there is nothing to grade, so the pass records a not-applicable diagnostic
 * rather than inventing an axis score for silence.
 */
import { describeDesign } from '../../serialization/graph-text';
import type { EvalPass } from '../../core/types';
import { NARRATIVE_AXIS_ID, NARRATIVE_AXIS_LABEL, narrativeSchema } from './narrative-schema';

export const NARRATIVE_PASS_ID = 'llm.narrative';

const SYSTEM_PROMPT = [
  'You are a principal engineer grading the DESIGN NARRATIVE of a',
  'system-design exercise — the prose the author submitted with the diagram.',
  'Grade how well the prose explains THIS diagram against THIS prompt: does',
  "it state every component's purpose, say how data and control flow between",
  'the components, and tie each described mechanism to the requirement it',
  'serves? Flag claims the diagram does not implement — a mechanism the story',
  'relies on with no node or edge behind it is a hole, not a plan — and',
  'components drawn but never explained. Score 0–100 on each subscore; be',
  'strict — 80+ means the prose alone would let a new engineer rebuild the',
  'diagram. Keep the summary to what the author should rewrite next.',
].join(' ');

export function createNarrativePass(): EvalPass {
  return {
    id: NARRATIVE_PASS_ID,
    mode: 'llm',
    run: async (ctx) => {
      if (!ctx.llm.enabled) {
        return [
          {
            passId: NARRATIVE_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-disabled',
            detail: null,
          },
        ];
      }

      if ((ctx.narrative?.trim() ?? '') === '') {
        return [
          {
            passId: NARRATIVE_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'not-applicable',
            detail: 'no design narrative was submitted with this revision',
          },
        ];
      }

      const design = describeDesign(ctx.graph, ctx.facts, ctx.narrative);
      const critique = await ctx.llm.completeStructured({
        system: SYSTEM_PROMPT,
        user: design.text,
        schema: narrativeSchema,
        maxTokens: 2048,
      });

      if (critique === null) {
        return [
          {
            passId: NARRATIVE_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-failed',
            detail: null,
          },
        ];
      }

      return [
        {
          passId: NARRATIVE_PASS_ID,
          kind: 'axis',
          axisId: NARRATIVE_AXIS_ID,
          label: NARRATIVE_AXIS_LABEL,
          score: critique.score,
          subScores: critique.subScores,
          summary: critique.summary.trim() || null,
          model: ctx.llm.model,
        },
        ...(design.clipped
          ? [
              {
                passId: NARRATIVE_PASS_ID,
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
