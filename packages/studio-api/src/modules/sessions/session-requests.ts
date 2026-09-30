import {
  designSubmissionSchema,
  MAX_IMPROVE_ITERATIONS,
  SESSION_STATUSES,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { listQueryShape } from '../../common/list-query';

/** The request shapes of the sessions routes. A submission is the contracts' own schema, verbatim. */

export const createSessionSchema = z.strictObject({ promptId: z.uuid() });

export const updateSessionSchema = z.strictObject({ status: z.enum(SESSION_STATUSES) });

export const listSessionsQuerySchema = z.strictObject({
  ...listQueryShape,
  promptId: z.uuid().optional(),
});
export type ListSessionsQueryInput = z.infer<typeof listSessionsQuerySchema>;

export const listRevisionsQuerySchema = z.strictObject({ ...listQueryShape });
export type ListRevisionsQueryInput = z.infer<typeof listRevisionsQuerySchema>;

export const submitRevisionSchema = designSubmissionSchema;

export const startImproveSchema = z.strictObject({
  ...designSubmissionSchema.shape,
  maxIterations: z.number().int().min(1).max(MAX_IMPROVE_ITERATIONS).optional(),
});
