/**
 * The router: read a brief, pick the registered judge built for it, run that
 * judge. The routes are never listed here — they are every registered
 * pipeline that takes a brief, read from the registry at run time — so a
 * fifth judge is a route the day it is registered. The classifier's answer
 * is evidence; the runner's declared-pipeline check is what dispatches.
 */
import { ROUTER_ORCHESTRATOR_ID, ROUTER_STEP_REASONS } from '@sysdesign/contracts';

import { bareRequest } from '../common';
import type { OrchestratorDefinition } from '../definition';
import { classify, judge, type RouterOutputs, type RouterPorts } from './steps';

export const ROUTER: OrchestratorDefinition<RouterOutputs, RouterPorts> = {
  id: ROUTER_ORCHESTRATOR_ID,
  version: '1.0.0',
  description: 'Read a brief, pick the registered judge built for it, and run that judge.',
  // The router chooses; a request that names a pipeline is refused by the service.
  takesTarget: false,
  reasons: ROUTER_STEP_REASONS,
  normalize: bareRequest,
  context: (ports) => Promise.resolve({ classifier: ports.llm }),
  steps: [
    { id: 'classify', run: classify },
    {
      id: 'judge',
      needs: ['classify'],
      pipeline: (_, outputs) => outputs.classify?.pipeline,
      run: judge,
    },
  ],
};
