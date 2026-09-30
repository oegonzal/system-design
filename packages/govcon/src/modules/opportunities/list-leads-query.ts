import { DEFAULT_LEAD_LIMIT, LEAD_TIERS, MAX_LEAD_LIMIT } from '@sysdesign/contracts';
import { z } from 'zod';

import { DEFAULT_PROFILE_ID } from '../../profiles';

/** The query of `GET /leads`. Coercion belongs here, at the HTTP edge — never in core/. */
export const listLeadsQuerySchema = z.strictObject({
  profile: z.string().min(1).default(DEFAULT_PROFILE_ID),
  minScore: z.coerce.number().min(0).max(100).default(0),
  tier: z.enum(LEAD_TIERS).optional(),
  naics: z
    .string()
    .regex(/^\d{2,6}$/)
    .optional(),
  setAside: z.string().min(1).max(32).optional(),
  noticeType: z.string().min(1).max(80).optional(),
  agency: z.string().min(1).max(200).optional(),
  q: z.string().min(1).max(200).optional(),
  deadlineWithinDays: z.coerce.number().int().min(0).max(3660).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LEAD_LIMIT).default(DEFAULT_LEAD_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListLeadsQueryInput = z.output<typeof listLeadsQuerySchema>;
