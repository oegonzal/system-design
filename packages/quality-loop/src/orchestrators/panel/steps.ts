/**
 * The two adapters every panel orchestrator composes. `panelStep` runs each
 * of the step's declared pipelines `samples` times, one after another, and
 * hands the finished runs on; `reconcileStep` reads them through the engine's
 * one view and reports where they agreed. Both are factories: the definition
 * says what a sample runs on and which runs are reconciled, so the map still
 * reads as data and the adapters know no orchestrator by name.
 */
import type { PanelAlignment, PanelReportDto, QualityRunDto } from '@sysdesign/contracts';
import { DEFAULT_PANEL_SAMPLES } from '@sysdesign/contracts';

import { outputsOf, reconcile } from '../../core/outputs';
import type { RunInput } from '../../core/loop/run-pipeline';
import { completed, skipped } from '../common';
import type { StepContext, StepResult } from '../runner/definition';

/** What every sample runs on, or the declared reason the panel cannot run at all. */
export type PanelSource = { input: RunInput } | { skip: string; note?: string | null };

/**
 * Run each declared pipeline `samples` times over one input. Sequential on
 * purpose: every sample is a whole run on the subscription client, and one
 * at a time is the rule there. A failed sample is counted, not fatal, unless
 * none completed — then the panel is the run's failure.
 */
interface Sampled {
  runs: QualityRunDto[];
  failed: number;
  lastError: QualityRunDto['error'];
}

/** Every declared pipeline `samples` times over one input, one child after another. */
async function runSamples<O extends object, P>(
  ctx: StepContext<O, P>,
  input: RunInput,
  samples: number,
): Promise<Sampled> {
  const sampled: Sampled = { runs: [], failed: 0, lastError: null };
  for (const pipeline of ctx.pipelines) {
    for (let sample = 0; sample < samples; sample += 1) {
      const child = await ctx.execute(input, pipeline);
      if (completed(child)) {
        sampled.runs.push(child);
      } else {
        sampled.failed += 1;
        sampled.lastError = child.error;
      }
    }
  }
  return sampled;
}

export const panelStep =
  <O extends object, P>(source: (ctx: StepContext<O, P>) => PanelSource) =>
  async (ctx: StepContext<O, P>): Promise<StepResult<QualityRunDto[]>> => {
    const from = source(ctx);
    if ('skip' in from) return skipped(from.skip, from.note);

    const samples = ctx.request.samples ?? DEFAULT_PANEL_SAMPLES;
    const { runs, failed, lastError } = await runSamples(ctx, from.input, samples);
    const counts = { lenses: ctx.pipelines.length, samples, completed: runs.length, failed };
    const shortfall = `${failed} of ${runs.length + failed} sample(s) failed`;
    if (runs.length === 0) {
      return {
        status: 'failed',
        reason: 'run-failed',
        note: shortfall,
        counts,
        error: lastError ?? {
          name: 'PanelFailed',
          message: 'no sample produced a trace',
          stack: null,
        },
      };
    }
    if (failed > 0) {
      return { status: 'complete', reason: 'sample-failed', note: shortfall, counts, output: runs };
    }
    return { status: 'complete', counts, output: runs };
  };

/**
 * Read the runs the definition names through the one view and report their
 * agreement. Two runs are the least that can disagree; fewer is a skip, not
 * a report that says everything agreed.
 */
export const reconcileStep =
  <O extends object, P>(
    runs: (ctx: StepContext<O, P>) => readonly (QualityRunDto | undefined)[],
    alignment: PanelAlignment,
  ) =>
  (ctx: StepContext<O, P>): Promise<StepResult<PanelReportDto>> => {
    const outputs = runs(ctx).flatMap((run) => (run?.trace ? [outputsOf(run.trace)] : []));
    if (outputs.length < 2) {
      return Promise.resolve({
        status: 'skipped',
        reason: 'too-few-runs',
        note: `${outputs.length} run(s) to reconcile`,
        counts: { runs: outputs.length },
      });
    }
    const report = reconcile(outputs, alignment);
    return Promise.resolve({
      status: 'complete',
      counts: {
        runs: report.runs,
        decisions: Object.keys(report.decisions).length,
        contestedTypes: report.contested.findingTypes.length,
        contestedFindings: report.contested.findings.length,
        overallRange: report.overall?.range ?? 0,
      },
      report: { ...report },
      output: report,
    });
  };
