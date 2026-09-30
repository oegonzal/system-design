/**
 * Second opinion: one artifact, judged again by fresh panels. The first step
 * produces it — or a provided run stands in — and the panel hands that same
 * artifact to the pipeline `samples` more times with the producer skipped,
 * so what the reconcile compares is judgement alone. On a fixed artifact the
 * finding keys line up, and a finding only some panels saw is the signal.
 * The first opinion is run zero of the reconcile.
 */
import {
  SECOND_OPINION_ORCHESTRATOR_ID,
  SECOND_OPINION_STEP_REASONS,
  type PanelReportDto,
  type QualityRunDto,
} from '@sysdesign/contracts';

import { outputsOf } from '../../core/outputs';
import { bareRequest, providedAsOutput, refuseInternal, requestInput, runTarget } from '../common';
import type { OrchestratorDefinition } from '../runner/definition';
import { panelStep, reconcileStep } from '../panel/steps';

export interface SecondOpinionOutputs {
  first: QualityRunDto;
  panel: QualityRunDto[];
  reconcile: PanelReportDto;
}

export const SECOND_OPINION: OrchestratorDefinition<SecondOpinionOutputs, unknown> = {
  id: SECOND_OPINION_ORCHESTRATOR_ID,
  version: '1.0.0',
  description: 'Judge one artifact again with fresh panels and report where they disagree.',
  takesTarget: true,
  reasons: SECOND_OPINION_STEP_REASONS,
  normalize: bareRequest,
  refuse: refuseInternal,
  context: () => Promise.resolve({}),
  steps: [
    {
      id: 'first',
      pipeline: (request) => request.pipeline,
      run: (ctx) => runTarget(ctx, requestInput(ctx.request)),
      provided: providedAsOutput,
    },
    {
      id: 'panel',
      needs: ['first'],
      pipeline: (request) => request.pipeline,
      run: panelStep<SecondOpinionOutputs, unknown>((ctx) => {
        const trace = ctx.outputs.first?.trace ?? null;
        const artifact = trace === null ? null : outputsOf(trace).artifact;
        if (artifact === null) return { skip: 'no-artifact', note: 'first' };
        // The judges read the bare brief: what a memory run appended for the
        // producer is not part of what the artifact is judged against.
        return { input: { goal: ctx.request.goal, output: artifact, maxIterations: 1 } };
      }),
    },
    {
      id: 'reconcile',
      needs: ['first', 'panel'],
      run: reconcileStep<SecondOpinionOutputs, unknown>(
        (ctx) => [ctx.outputs.first, ...(ctx.outputs.panel ?? [])],
        'provided',
      ),
    },
  ],
};
