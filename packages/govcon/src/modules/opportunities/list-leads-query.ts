import { DEFAULT_LEAD_LIMIT, LEAD_TIERS, MAX_LEAD_LIMIT, NOTICE_TYPES } from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** Notice types as a query spells them: comma-joined or repeated, each a label as SAM.gov gives it, each once. */
const noticeTypes = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => [
    ...new Set(
      (Array.isArray(value) ? value : value.split(','))
        .map((label) => label.trim())
        .filter((label) => label.length > 0),
    ),
  ])
  .pipe(z.array(z.string().max(80)).min(1).max(Object.keys(NOTICE_TYPES).length));

/** The query of `GET /leads`; no profile means the default. Coercion belongs here, at the HTTP edge — never in core/. */
export const listLeadsQuerySchema = z.strictObject({
  profile: z.string().min(1).optional(),
  minScore: z.coerce.number().min(0).max(100).default(0),
  tier: z.enum(LEAD_TIERS).optional(),
  naics: z
    .string()
    .regex(/^\d{2,6}$/)
    .optional(),
  setAside: z.string().min(1).max(32).optional(),
  noticeTypes: noticeTypes.optional(),
  agency: z.string().min(1).max(200).optional(),
  q: z.string().min(1).max(200).optional(),
  deadlineWithinDays: z.coerce.number().int().min(0).max(3660).optional(),
  ...pageFields(MAX_LEAD_LIMIT, DEFAULT_LEAD_LIMIT),
});
export type ListLeadsQueryInput = z.output<typeof listLeadsQuerySchema>;
