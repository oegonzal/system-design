import {
  DEFAULT_LIST_LIMIT,
  designSubmissionSchema,
  MAX_IMPROVE_ITERATIONS,
  MAX_LIST_LIMIT,
  SESSION_STATUSES,
  sessionDraftSchema,
} from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** The request shapes of the sessions routes. A submission is the contracts' own schema, verbatim. */

export const createSessionSchema = z.strictObject({ promptId: z.uuid() });

export const updateSessionSchema = z.strictObject({ status: z.enum(SESSION_STATUSES) });

export const listSessionsQuerySchema = z.strictObject({
  ...pageFields(MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT),
  promptId: z.uuid().optional(),
});
export type ListSessionsQueryInput = z.infer<typeof listSessionsQuerySchema>;

export const listRevisionsQuerySchema = z.strictObject(
  pageFields(MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT),
);
export type ListRevisionsQueryInput = z.infer<typeof listRevisionsQuerySchema>;

/** The transcript is the server's to compose from the session's turns; a body that carries one is refused. */
export const submitRevisionSchema = designSubmissionSchema.omit({ transcript: true });

/** The unsubmitted canvas: the contracts' draft schema, shape only. */
export const putSessionDraftSchema = sessionDraftSchema;

const maxIterations = z.number().int().min(1).max(MAX_IMPROVE_ITERATIONS).optional();

/** The coach starts from the draft, or from a graded revision of the session. */
export const startImproveFromDraftSchema = z.strictObject({
  ...submitRevisionSchema.shape,
  maxIterations,
});
export const startImproveFromRevisionSchema = z.strictObject({
  baseRevisionId: z.uuid(),
  maxIterations,
});
export const startImproveSchema = z.union([
  startImproveFromDraftSchema,
  startImproveFromRevisionSchema,
]);
