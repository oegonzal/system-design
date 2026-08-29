/**
 * The adversarial pass: deterministic scenario selection, LLM narration. The
 * model walks each what-if through the candidate design and reports survives
 * / degrades / fails with the weakest nodes named. Reports ride a
 * ScenarioArtifact — display and audit material; the runner turns failure
 * verdicts into advisory llm-source findings at persistence time, and the
 * aggregator's score math never sees any of it.
 */
import { describeDesign } from '../../serialization/graph-text';
import type { EvalPass } from '../../core/types';
import { buildScenarioSchema } from './scenario-schema';
import { selectScenarios } from './scenario-table';

export const SCENARIOS_PASS_ID = 'llm.scenarios';

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
        schema: buildScenarioSchema(selected),
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
      const realNodeIds = new Set(ctx.graph.nodes.map((node) => node.id));
      const seen = new Set<string>();
      const reports = critique.reports.flatMap((report) => {
        if (seen.has(report.scenarioId)) return []; // one report per scenario, first wins
        seen.add(report.scenarioId);
        return [
          {
            scenarioId: report.scenarioId,
            title: titleById.get(report.scenarioId) ?? report.scenarioId,
            verdict: report.verdict,
            story: report.story.trim(),
            weakestNodeIds: report.weakestNodeIds.filter((id) => realNodeIds.has(id)),
          },
        ];
      });

      return [{ passId: SCENARIOS_PASS_ID, kind: 'scenarios', reports, model: ctx.llm.model }];
    },
  };
}
