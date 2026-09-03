/**
 * The dedicated narrative critic: an LLM grades how well the author's prose
 * explains the diagram it was submitted with — alignment, not eloquence —
 * and reports the misalignments it finds. The score is an AxisArtifact and
 * the findings an AnnotationArtifact; the aggregator carries both through
 * untouched (advisory llm-source findings, structurally unable to move the
 * score). Without a narrative there is nothing to grade, so the pass records
 * a not-applicable diagnostic rather than inventing an axis score for
 * silence. Two grounding sections keep the critique honest: a reference frame
 * built from typed facts (which real components carry substantive prose, which
 * requirements are narrated) so it grades quality against the same anchors the
 * score uses, and the deterministic verdicts as a dedup section so the model
 * adds rather than repeats.
 */
import { realComponentNodes } from '@sysdesign/contracts';

import { describeDesign } from '../../serialization/graph-text';
import { isCoverageArtifact, isFindingsArtifact } from '../../core/artifacts';
import type { EvalPass, PassContext } from '../../core/types';
import { NARRATIVE_AXIS_ID, NARRATIVE_AXIS_LABEL, narrativeSchema } from './narrative-schema';

export const NARRATIVE_PASS_ID = 'llm.narrative';

const SYSTEM_PROMPT = [
  'You are a principal engineer grading the DESIGN NARRATIVE — the prose the',
  'author wrote to explain their diagram. Judge explanation QUALITY, not',
  'eloquence: for THIS diagram and THIS prompt, does the prose give every',
  'component a clear purpose, trace how control and data actually flow, and tie',
  'each mechanism to the requirement it serves?',
  'Reward prose that is specific to THIS design — that names real components,',
  "cites the diagram's own numbers and mechanisms, and explains WHY a choice",
  'was made. Penalize vague, generic, or filler sentences that would fit any',
  "diagram, and prose that restates a component's label without adding meaning.",
  'Score each subscore 0–100 and be strict: 80+ means the prose alone would let',
  'a new engineer rebuild and defend the design.',
  'Report ONLY misalignments as findings: a mechanism the story leans on with',
  'no node or edge behind it, a flow described differently than drawn, a',
  'requirement waved at without naming its mechanism. Quote the offending claim',
  'and reference node ids.',
  'The deterministic engine already grades the brief and whether prose is',
  'present — its verdicts are listed below; never restate them. Your job is the',
  "writing's quality and its alignment to the diagram alone.",
  'Keep the summary to the single most valuable rewrite.',
].join(' ');

/**
 * The reference frame the deterministic layer credits: which real components
 * carry substantive prose, which requirements are narrated, whether the
 * overview holds up. Given so the critic grades the QUALITY of the explanation
 * against the same anchors the score uses — not a set it hallucinates — and can
 * see the gaps. Built from typed facts already on the context; no prose is read
 * here, and it names nothing archetype-specific.
 */
function groundingSection(ctx: PassContext): string {
  const explained = new Set(ctx.narration?.explainedNodeIds ?? []);
  const components = realComponentNodes(ctx.graph).map(
    (node) =>
      `  ${node.id} (${node.label}) — ${explained.has(node.id) ? 'has substantive prose' : 'NOT yet explained'}`,
  );
  const narrated = new Set(ctx.narration?.narratedRequirementIndexes ?? []);
  const requirements = Array.from({ length: ctx.facts.functionalRequirementCount }, (_, index) =>
    narrated.has(index)
      ? `  requirement #${index} — narrated`
      : `  requirement #${index} — NOT narrated`,
  );
  return [
    `Overview: ${ctx.narration?.overviewSubstantive ? 'substantive' : 'thin or missing'}`,
    `Components on the diagram (grade the quality of each explanation; a missing one is a gap):`,
    components.length > 0 ? components.join('\n') : '  (none)',
    `Functional requirements (each should have a flow narration):`,
    requirements.length > 0 ? requirements.join('\n') : '  (none)',
  ].join('\n');
}

/** The deterministic engine's brief verdicts, as a do-not-repeat section. */
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
          `# Reference frame (grade the QUALITY for each; do not merely check presence)`,
          groundingSection(ctx),
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
          factors: null,
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
