/**
 * The queries the two memory reports take. Coercion belongs here, at the HTTP
 * edge — never in a report, which reads records and nothing else.
 */
import { z } from 'zod';

/** How many runs one report answers about. Low by default: each row is a run read in full. */
const DEFAULT_REPORT_LIMIT = 25;
const MAX_REPORT_LIMIT = 100;

const limit = z.coerce.number().int().min(1).max(MAX_REPORT_LIMIT).default(DEFAULT_REPORT_LIMIT);

export const effectivenessQuerySchema = z.strictObject({
  pipeline: z.string().min(1).optional(),
  limit,
});

export const gapsQuerySchema = z.strictObject({
  /** A run whose brief to group by: a recall run names it through its parent. */
  runId: z.string().min(1).max(80).optional(),
  /** The brief's own hash, as a group reports it. */
  goalHash: z.string().length(64).optional(),
  limit,
});
