import {
  APPLICATION_STATUSES,
  CORRECTABLE_STATUSES,
  DOCUMENT_SUBJECT_MAX_LENGTH,
  keptAtMost,
  TASK_LABEL_BOUND,
  UNIT_FACET_VALUE_MAX_LENGTH,
  URL_MAX_LENGTH,
  type CorrectApplicationRequest,
  type CreateApplicationRequest,
} from '@sysdesign/contracts';
import { z } from 'zod';

/** The record's request bodies and queries, checked at the door with the bounds the contracts declare for each value. */
const subject = z.string().trim().min(1).max(DOCUMENT_SUBJECT_MAX_LENGTH);
const company = z.string().trim().min(1).max(UNIT_FACET_VALUE_MAX_LENGTH);

export const createApplicationSchema = z.strictObject({
  subject,
  company,
  label: z.string().trim().min(1).max(keptAtMost(TASK_LABEL_BOUND)).optional(),
  url: z.url().max(URL_MAX_LENGTH).optional(),
  status: z.enum(CORRECTABLE_STATUSES).optional(),
  appliedAt: z.iso.datetime().optional(),
}) satisfies z.ZodType<CreateApplicationRequest>;

export const correctApplicationSchema = z.strictObject({
  status: z.enum(CORRECTABLE_STATUSES),
}) satisfies z.ZodType<CorrectApplicationRequest>;

/** The most applications one page lists. */
const PAGE_MAX = 200;

export const applicationsQuerySchema = z.strictObject({
  subject,
  company: company.optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  since: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ApplicationsQueryInput = z.infer<typeof applicationsQuerySchema>;

export const companiesQuerySchema = z.strictObject({ subject });
