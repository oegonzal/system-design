/**
 * The two adapters every panel orchestrator composes. `panelStep` runs each
 * of the step's declared pipelines `samples` times, a bounded few at once, and
 * hands the finished runs on; `reconcileStep` reads them through the engine's
 * one view and reports where they agreed. Both are factories: the definition
 * says what a sample runs on and which runs are reconciled, so the map still
 * reads as data and the adapters know no orchestrator by name.
 */
import type { PanelAlignment, PanelReportDto, QualityRunDto } from '@sysdesign/contracts';
import { DEFAULT_PANEL_SAMPLES, panelReportSchema } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import { mapConcurrent } from '../../core/loop/scoped-llm';
import { outputsOf, reconcile } from '../../core/outputs';
import type { RunInput } from '../../core/loop/run-pipeline';
import { completed, skipped } from '../common';
import type { StepContext, StepResult } from '../runner/definition';

/** The one report a panel orchestrator's steps make — the reconcile's — declared once for both. */
export const PANEL_REPORTS: Readonly<Record<'reconcile', ZodType>> = {
  reconcile: panelReportSchema,
};

/** What every sample runs on, or the declared reason the panel cannot run at all. */
export type PanelSource = { input: RunInput } | { skip: string; note?: string | null };

/**
 * Samples are independent by construction — the whole point of a panel is that
 * nothing passes between them — so a declared number of them run at once. The
 * number is small and declared per orchestrator rather than computed: every
 * sample is a whole run, each wanting its own pipeline's worth of calls, and
 * what the provider will actually bear is the process gate's business, not an
 * orchestrator's guess.
 *
 * What is NOT concurrent is how the results are read. `mapConcurrent` writes
 * each child back into its own position, so the runs handed on, the ids
 * recorded and the error carried are all functions of the sample's index and
 * not of which sample happened to finish first. That matters: the reconcile
 * report's `seenBy` indexes this array, so a settle-ordered panel would
 * silently re-label which run saw which finding.
 */
interface Sampled {
  runs: QualityRunDto[];
  failed: number;
  lastError: QualityRunDto['error'];
  /** Every child attempted, in sample order — failures included. */
  runIds: string[];
}

/** Every declared pipeline `samples` times over one input, a few at a time. */
async function runSamples<O extends object, P>(
  ctx: StepContext<O, P>,
  input: RunInput,
  samples: number,
  concurrency: number,
): Promise<Sampled> {
  const units = ctx.pipelines.flatMap((pipeline) =>
    Array.from({ length: samples }, () => pipeline),
  );
  const children = await mapConcurrent(units, concurrency, (pipeline) =>
    ctx.execute(input, pipeline),
  );
  const sampled: Sampled = { runs: [], failed: 0, lastError: null, runIds: [] };
  for (const child of children) {
    sampled.runIds.push(child.runId);
    if (completed(child)) sampled.runs.push(child);
    else {
      sampled.failed += 1;
      // The last by sample index, not the last to settle: a panel must report
      // the same failure however its samples were interleaved.
      sampled.lastError = child.error;
    }
  }
  return sampled;
}

/** How many samples a panel runs at once unless its orchestrator declares otherwise. */
const DEFAULT_PANEL_CONCURRENCY = 2;

export const panelStep =
  <O extends object, P>(
    source: (ctx: StepContext<O, P>) => PanelSource,
    options: { concurrency?: number } = {},
  ) =>
  async (ctx: StepContext<O, P>): Promise<StepResult<QualityRunDto[]>> => {
    const from = source(ctx);
    if ('skip' in from) return skipped(from.skip, from.note);

    const samples = ctx.request.samples ?? DEFAULT_PANEL_SAMPLES;
    const { runs, failed, lastError, runIds } = await runSamples(
      ctx,
      from.input,
      samples,
      options.concurrency ?? DEFAULT_PANEL_CONCURRENCY,
    );
    const counts = { lenses: ctx.pipelines.length, samples, completed: runs.length, failed };
    const shortfall = `${failed} of ${runs.length + failed} sample(s) failed`;
    if (runs.length === 0) {
      return {
        status: 'failed',
        reason: 'run-failed',
        note: shortfall,
        counts,
        runIds,
        error: lastError ?? {
          name: 'PanelFailed',
          message: 'no sample produced a trace',
          stack: null,
        },
      };
    }
    if (failed > 0) {
      return {
        status: 'complete',
        reason: 'sample-failed',
        note: shortfall,
        counts,
        runIds,
        output: runs,
      };
    }
    return { status: 'complete', counts, runIds, output: runs };
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
