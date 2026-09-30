/**
 * Calibration: one goal, run several times through its own pipeline, then
 * reconciled. Every sample produces its own artifact, so what the report
 * compares is what the policy keys — decisions, dimensions, finding types —
 * and the spread it shows is the loop's end-to-end variance, producer and
 * judges together. Two steps over one registered pipeline, declared as data.
 */
import {
  CALIBRATION_ORCHESTRATOR_ID,
  PANEL_STEP_REASONS,
  type PanelReportDto,
  type QualityRunDto,
} from '@sysdesign/contracts';

import { bareRequest, refuseInternal, requestInput } from '../common';
import type { OrchestratorDefinition } from '../runner/definition';
import { panelStep, reconcileStep } from '../panel/steps';

export interface CalibrationOutputs {
  panel: QualityRunDto[];
  reconcile: PanelReportDto;
}

export const CALIBRATION: OrchestratorDefinition<CalibrationOutputs, unknown> = {
  id: CALIBRATION_ORCHESTRATOR_ID,
  version: '1.0.0',
  description:
    'Run one goal several times through its pipeline and report how far the verdicts spread.',
  takesTarget: true,
  reasons: PANEL_STEP_REASONS,
  normalize: bareRequest,
  refuse: refuseInternal,
  context: () => Promise.resolve({}),
  steps: [
    {
      id: 'panel',
      pipeline: (request) => request.pipeline,
      run: panelStep<CalibrationOutputs, unknown>((ctx) => ({ input: requestInput(ctx.request) })),
    },
    {
      id: 'reconcile',
      needs: ['panel'],
      run: reconcileStep<CalibrationOutputs, unknown>((ctx) => ctx.outputs.panel ?? [], 'produced'),
    },
  ],
};
