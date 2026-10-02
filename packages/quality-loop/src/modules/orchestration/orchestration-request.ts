import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  MAX_PANEL_SAMPLES,
  QUALITY_RUN_STATUSES,
} from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

import { runRequestShape } from '../runs/run-request';

const samples = z.number().int().min(1).max(MAX_PANEL_SAMPLES).optional();

/**
 * The same inputs as `POST /runs`, plus the two an orchestration decides for
 * itself: the target is optional here because an orchestrator that chooses
 * its own pipeline refuses one (and one that takes a target requires it —
 * the service enforces the declaration), and `samples` sizes a panel step.
 * Which of them reach which step is the orchestrator's business. A run's own
 * `recall` is not among them: the memory orchestrator recalls as a step.
 */
export const orchestrationRequestSchema = runRequestShape
  .omit({ adopt: true, recall: true })
  .extend({
    pipeline: z.string().min(1).optional(),
    samples,
  });

/** The body of `POST /orchestrations/:orchestrator/from-run`: an already persisted run to start from. */
export const fromRunRequestSchema = z.strictObject({
  runId: z.string().min(1).max(80),
  samples,
});

/** The query of `GET /orchestrations`. Coercion belongs here, at the HTTP edge — never in core/. */
export const listOrchestrationsQuerySchema = z.strictObject({
  orchestrator: z.string().min(1).optional(),
  pipeline: z.string().min(1).optional(),
  status: z.enum(QUALITY_RUN_STATUSES).optional(),
  ...pageFields(MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT),
});
export type ListOrchestrationsQuery = z.output<typeof listOrchestrationsQuerySchema>;

const orchestrationRunId = z.uuid();

/** An orchestration run id is a uuid; anything else cannot be a row, so it is not found rather than a database error. */
export const isOrchestrationRunId = (id: string): boolean =>
  orchestrationRunId.safeParse(id).success;
