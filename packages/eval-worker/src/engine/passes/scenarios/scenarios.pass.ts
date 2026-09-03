/**
 * The adversarial pass: deterministic scenario selection, LLM narration. The
 * model walks each what-if through the candidate design and reports survives
 * / degrades / fails with the weakest nodes named. Reports ride a
 * ScenarioArtifact for display; a failing or degrading verdict is ALSO graded
 * evidence on the reliability dimension — the engine maps the verdict to a
 * weakness magnitude (the model never picks a number), grounded to the NFR
 * the failure would violate and the weakest components.
 */
import type { AxisFactorLevel, ScenarioVerdict } from '@sysdesign/contracts';

import { describeDesign } from '../../serialization/graph-text';
import type { EvalPass } from '../../core/types';
import { groundingSets, SEVERITY_FROM_LEVEL, toGradedItem } from '../graded-grounding';
import { buildScenarioSchema } from './scenario-schema';
import { selectScenarios } from './scenario-table';

export const SCENARIOS_PASS_ID = 'llm.scenarios';
export const SCENARIOS_LENS = 'evaluator.scenarios';

/** Verdict → weakness magnitude, engine-owned. 'survives' is no weakness and emits nothing. */
const VERDICT_LEVEL: Record<ScenarioVerdict, AxisFactorLevel> = {
  survives: 'none',
  degrades: 'medium',
  fails: 'high',
};

const SYSTEM_PROMPT = [
  'You are an adversarial reviewer stress-testing a system design. For each',
  'named scenario, walk the failure through THIS design honestly: what',
  'saturates, what times out, what loses data, what recovers. Verdict',
  '"survives" only when the design has a concrete mechanism for the scenario;',
  '"degrades" when it stays up but violates its targets; "fails" when the',
  'scenario takes the workload down or corrupts data. Treat declared',
  "operations and carries as the design's contracts: a replayed command",
  'declared idempotent converges; one not declared idempotent repeats its',
  'side effect. Name the weakest node',
  'ids. One report per scenario, no scenarios of your own.',
].join(' ');

export function createScenariosPass(): EvalPass {
  return {
    id: SCENARIOS_PASS_ID,
    mode: 'llm',
    run: async (ctx) => {
      if (!ctx.llm.enabled) {
        return [
          {
            passId: SCENARIOS_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-disabled',
            detail: null,
          },
        ];
      }

      const selected = selectScenarios(ctx.facts.archetype, ctx.facts.difficulty);
      const design = describeDesign(ctx.graph, ctx.facts, ctx.narrative);
      const critique = await ctx.llm.completeStructured({
        system: SYSTEM_PROMPT,
        user: [
          design.text,
          ``,
          `# Scenarios to walk through (one report each)`,
          ...selected.map(
            (scenario) => `  ${scenario.id}: ${scenario.title} — ${scenario.description}`,
          ),
        ].join('\n'),
        schema: buildScenarioSchema(selected, ctx.graph, ctx.facts),
        maxTokens: 4096,
      });

      if (critique === null) {
        return [
          {
            passId: SCENARIOS_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-failed',
            detail: null,
          },
        ];
      }

      const titleById = new Map(selected.map((scenario) => [scenario.id, scenario.title]));
      const known = groundingSets(ctx.graph, ctx.facts);
      const seen = new Set<string>();
      const accepted = critique.reports.filter((report) => {
        if (seen.has(report.scenarioId)) return false; // one report per scenario, first wins
        seen.add(report.scenarioId);
        return true;
      });

      const reports = accepted.map((report) => ({
        scenarioId: report.scenarioId,
        title: titleById.get(report.scenarioId) ?? report.scenarioId,
        verdict: report.verdict,
        story: report.story.trim(),
        weakestNodeIds: report.weakestNodeIds.filter((id) => known.nodes.has(id)),
      }));

      // A failure story is a reliability weakness; its magnitude is the
      // verdict's, its grounding the NFR it would break.
      const items = accepted
        .filter((report) => VERDICT_LEVEL[report.verdict] !== 'none')
        .map((report) => {
          const level = VERDICT_LEVEL[report.verdict];
          return toGradedItem(
            {
              weakness: level,
              confidence: report.confidence,
              requirementId: report.violatesRequirementId,
              affectedComponents: report.weakestNodeIds,
            },
            {
              dimension: 'reliability',
              severity: SEVERITY_FROM_LEVEL[level],
              rationale: `${titleById.get(report.scenarioId) ?? report.scenarioId}: ${report.story.trim()}`,
            },
            known,
          );
        });

      return [
        { passId: SCENARIOS_PASS_ID, kind: 'scenarios', reports, model: ctx.llm.model },
        ...(items.length > 0
          ? [
              {
                passId: SCENARIOS_PASS_ID,
                kind: 'graded-evidence' as const,
                lens: SCENARIOS_LENS,
                items,
                summary: null,
                model: ctx.llm.model,
              },
            ]
          : []),
      ];
    },
  };
}
