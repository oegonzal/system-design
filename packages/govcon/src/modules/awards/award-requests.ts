import {
  AWARD_SOURCES,
  DEFAULT_AWARD_LIMIT,
  MAX_AWARD_LIMIT,
  UEI_SHAPE,
  type AwardsQuery,
  type FetchAwardsRequest,
} from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const naics = z.string().regex(/^\d{2,6}$/);
const psc = z.string().regex(/^[A-Z0-9]{1,4}$/);

/** The filters of `GET /awards/summary`. */
export const awardFiltersSchema = z.strictObject({
  naics: naics.optional(),
  psc: psc.optional(),
  agency: z.string().min(1).max(200).optional(),
  solicitationNumber: z.string().min(1).max(200).optional(),
  awardeeUei: z.string().regex(UEI_SHAPE).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  source: z.enum(AWARD_SOURCES).optional(),
});
export type AwardFiltersInput = z.output<typeof awardFiltersSchema>;

/** The query of `GET /awards`: the filters and the page. */
export const awardsQuerySchema = awardFiltersSchema.extend(
  pageFields(MAX_AWARD_LIMIT, DEFAULT_AWARD_LIMIT),
) satisfies z.ZodType<AwardsQuery>;
export type AwardsQueryInput = z.output<typeof awardsQuerySchema>;

/** The body of `POST /awards/fetch`: which sources to spend on, for which codes and dates. */
export const fetchAwardsRequestSchema = z
  .strictObject({
    naics: z.array(naics).max(20).default([]),
    psc: z.array(psc).max(20).default([]),
    from: isoDate,
    to: isoDate,
    sources: z.array(z.enum(AWARD_SOURCES)).min(1),
  })
  .refine((body) => body.naics.length + body.psc.length > 0, {
    path: ['naics'],
    message: 'name at least one NAICS or PSC code',
  })
  .refine((body) => body.from <= body.to, {
    path: ['to'],
    message: 'to must not precede from',
  }) satisfies z.ZodType<FetchAwardsRequest>;
export type FetchAwardsBody = z.output<typeof fetchAwardsRequestSchema>;
