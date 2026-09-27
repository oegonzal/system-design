import { DEFAULT_LEAD_LIMIT, LEAD_TIERS, MAX_LEAD_LIMIT } from '@sysdesign/contracts';
import { z } from 'zod';

import { DEFAULT_PROFILE_ID } from '../../profiles';

/** The query of `GET /leads`. Coercion belongs here, at the HTTP edge — never in core/. */
export const listLeadsQuerySchema = z.strictObject({
  profile: z.string().min(1).default(DEFAULT_PROFILE_ID),
  minScore: z.coerce.number().min(0).max(100).default(0),
  tier: z.enum(LEAD_TIERS).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LEAD_LIMIT).default(DEFAULT_LEAD_LIMIT),
});
export type ListLeadsQueryInput = z.output<typeof listLeadsQuerySchema>;
