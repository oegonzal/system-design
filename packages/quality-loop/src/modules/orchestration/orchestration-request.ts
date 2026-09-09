import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, QUALITY_RUN_STATUSES } from '@sysdesign/contracts';
import { z } from 'zod';

/** The same inputs as `POST /runs`; which of them reach which step is the orchestrator's business. */
export { runRequestSchema } from '../runs/run-request';

/** The body of `POST /orchestrations/:orchestrator/from-run`: an already persisted run to start from. */
export const fromRunRequestSchema = z.strictObject({ runId: z.string().min(1).max(80) });

/** The query of `GET /orchestrations`. Coercion belongs here, at the HTTP edge — never in core/. */
export const listOrchestrationsQuerySchema = z.strictObject({
  orchestrator: z.string().min(1).optional(),
  pipeline: z.string().min(1).optional(),
  status: z.enum(QUALITY_RUN_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListOrchestrationsQuery = z.output<typeof listOrchestrationsQuerySchema>;
