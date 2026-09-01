/**
 * The dedicated narrative critic: an LLM grades how well the author's prose
 * explains the diagram it was submitted with — alignment, not eloquence —
 * and reports the misalignments it finds. The score is an AxisArtifact and
 * the findings an AnnotationArtifact; the aggregator carries both through
 * untouched (advisory llm-source findings, structurally unable to move the
 * score). Without a narrative there is nothing to grade, so the pass records
 * a not-applicable diagnostic rather than inventing an axis score for
 * silence. The deterministic narrative verdicts ride along as a dedup
 * section, so the model adds rather than repeats.
 */
import { describeDesign } from '../../serialization/graph-text';
import { isCoverageArtifact, isFindingsArtifact } from '../../core/artifacts';
import type { EvalPass, PassContext } from '../../core/types';
import { NARRATIVE_AXIS_ID, NARRATIVE_AXIS_LABEL, narrativeSchema } from './narrative-schema';

export const NARRATIVE_PASS_ID = 'llm.narrative';

const SYSTEM_PROMPT = [
  'You are a principal engineer grading the DESIGN NARRATIVE of a',
  'system-design exercise — the prose the author submitted with the diagram.',
  'Grade how well the prose explains THIS diagram against THIS prompt: does',
  "it state every component's purpose, say how data and control flow between",
  'the components, and tie each described mechanism to the requirement it',
  'serves? Score 0–100 on each subscore; be strict — 80+ means the prose',
  'alone would let a new engineer rebuild the diagram.',
  'Report misalignments as findings: a mechanism the story relies on with no',
  'node or edge behind it is a hole, not a plan; a flow described differently',
  'than drawn is a contradiction; a requirement the prose waves at without',
  'naming its mechanism is unearned confidence. Quote the offending claim in',
  'each finding and reference node ids. The deterministic engine already',
  'graded prose coverage — its verdicts are included; never restate them.',
  'Keep the summary to what the author should rewrite next.',
].join(' ');

/** The deterministic engine's narrative verdicts, as a do-not-repeat section. */
function deterministicSection(ctx: PassContext): string {
  const entries = ctx.priorArtifacts
    .filter(isCoverageArtifact)
    .flatMap((artifact) => artifact.entries)
    // By dimension, not by id prefix: the typed field is the fact, an id
    // naming convention is a coincidence that a rename would silently break.
    .filter((entry) => entry.dimension === 'explanation')
    .map((entry) => `  [${entry.met ? 'met' : 'unmet'}] ${entry.expectationId}`);
  const findings = ctx.priorArtifacts
    .filter(isFindingsArtifact)
    .flatMap((artifact) => artifact.findings)
    .filter((finding) => finding.dimension === 'explanation')
    .map(
      (finding) =>
        `  [${finding.severity}] ${finding.ruleId ?? finding.expectationId}: ${finding.title}`,
    );
  const lines = [...entries, ...findings];
  return lines.length === 0 ? '  (none)' : lines.join('\n');
}

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
        user: [
          design.text,
          ``,
          `# Already graded deterministically (do not repeat)`,
          deterministicSection(ctx),
        ].join('\n'),
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
        // Misalignment findings ride as advisory annotations; the general
        // critic's summary stays the evaluation summary (first-wins merge).
        ...(critique.findings.length > 0
          ? [
              {
                passId: NARRATIVE_PASS_ID,
                kind: 'annotations' as const,
                findings: critique.findings,
                summary: null,
                model: ctx.llm.model,
              },
            ]
          : []),
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
