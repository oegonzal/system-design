import {
  CRITERION_ID_MAX_LENGTH,
  CRITERION_KIND_MAX_LENGTH,
  CRITERION_STATEMENT_MAX_LENGTH,
  MAX_PROVIDED_CRITERIA,
  MAX_QUALITY_RUN_ITERATIONS,
  QUALITY_RUN_STATUSES,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { PAGE_FIELDS } from '../http/paging';

/** One criterion of a supplied rubric; the caps are the persisted row's. */
export const providedCriterionSchema = z.strictObject({
  id: z.string().min(1).max(CRITERION_ID_MAX_LENGTH),
  kind: z.string().min(1).max(CRITERION_KIND_MAX_LENGTH),
  statement: z.string().min(1).max(CRITERION_STATEMENT_MAX_LENGTH),
});

/**
 * The HTTP body of `POST /runs`. `output` is any JSON; the pipeline's schema
 * validator judges it. `criteria` is a fixed rubric that replaces derivation;
 * whether it fits the pipeline is the service's check, after the shape.
 * `adopt` names a recorded iteration to start from; whether it exists and
 * matches is the service's check too — here only the shape and the two
 * rules a body can break on its own.
 */
export const runRequestShape = z.strictObject({
  pipeline: z.string().min(1),
  goal: z.string().min(1),
  output: z.unknown().optional(),
  maxIterations: z.number().int().min(1).max(MAX_QUALITY_RUN_ITERATIONS).optional(),
  criteria: z.array(providedCriterionSchema).min(1).max(MAX_PROVIDED_CRITERIA).optional(),
  adopt: z
    .strictObject({
      runId: z.string().min(1).max(80),
      iteration: z.number().int().min(1).max(MAX_QUALITY_RUN_ITERATIONS),
    })
    .optional(),
});

/** The shape with the two rules a body can break on its own; a request that extends the shape adds its own. */
export const runRequestSchema = runRequestShape
  .refine((body) => body.output === undefined || body.adopt === undefined, {
    message: 'output and adopt are mutually exclusive',
    path: ['adopt'],
  })
  .refine((body) => body.adopt === undefined || body.criteria !== undefined, {
    message: 'adopt requires the rubric the adopted run was judged against',
    path: ['criteria'],
  });

/** The query of `GET /runs`. Coercion belongs here, at the HTTP edge — never in core/. */
export const listRunsQuerySchema = z.strictObject({
  pipeline: z.string().min(1).optional(),
  status: z.enum(QUALITY_RUN_STATUSES).optional(),
  ...PAGE_FIELDS,
});
export type ListRunsQuery = z.output<typeof listRunsQuerySchema>;
