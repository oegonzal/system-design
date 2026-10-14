import {
  AWARD_FAMILY_CHOICES,
  AWARD_ID_SHAPE,
  AWARD_PLACEMENTS,
  BREAKDOWN_CATEGORIES,
  DEFAULT_HORIZON_MONTHS,
  DEFAULT_PULSE_LOOKBACK_YEARS,
  FIRST_FISCAL_YEAR,
  fiscalYearStart,
  MAX_HORIZON_MONTHS,
  MAX_PULSE_LOOKBACK_YEARS,
  MAX_SCOPE_CODES,
  parseAmountRange,
  RECIPIENT_SIZES,
  UEI_SHAPE,
  type AgencyOutlookQuery,
  type FacetId,
  type FacetQuery,
  type SpendingBreakdownQuery,
  type SpendingHorizonQuery,
  type SpendingPrimesQuery,
  type SpendingPulseQuery,
  type SpendingReachQuery,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { idsOf } from '../../core/spending/schemas';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** USAspending filters NAICS by families of 2, 4 or 6 digits and refuses any other length, so a scope names only those. */
const naics = z.string().regex(/^(\d{2}|\d{4}|\d{6})$/, 'a NAICS family is 2, 4 or 6 digits');
const psc = z.string().regex(/^[A-Z0-9]{1,4}$/);

/**
 * A list of codes however the query string spelled it — `a,b` or `x=a&x=b` —
 * deduplicated and sorted, so the same scope is one canonical query and one
 * snapshot key.
 */
const codes = (code: z.ZodString) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((value) => {
      const spelled = Array.isArray(value) ? value : value.split(',');
      return [
        ...new Set(spelled.map((item) => item.trim()).filter((item) => item.length > 0)),
      ].sort();
    })
    .pipe(z.array(code).max(MAX_SCOPE_CODES));

/** A set-aside as the award sources code it. */
const setAside = z.string().regex(/^[A-Za-z0-9]{1,12}$/);

/** A dollar range as it is spelled — `min-max`, either end open — refused when it is not one. */
const amountRange = z.string().transform((text, context) => {
  const range = parseAmountRange(text);
  if (range !== null) return range;
  context.addIssue({
    code: 'custom',
    message: 'a range is min-max in dollars, either end open, the floor not above the ceiling',
  });
  return z.NEVER;
});

/** The facets a scoped query may carry — one field per facet, so a facet without one cannot compile. */
const facetFields = {
  // A UEI is read in capitals however it was typed, as the address reads one.
  recipient: codes(
    z.string().toUpperCase().regex(UEI_SHAPE, 'a UEI is twelve letters and digits'),
  ).default([]),
  recipientSize: idsOf(RECIPIENT_SIZES).optional(),
  placement: idsOf(AWARD_PLACEMENTS).optional(),
  setAside: codes(setAside).default([]),
  amount: amountRange.optional(),
  newOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
} satisfies { [K in FacetId]: z.ZodType<FacetQuery[K]> };

/** The codes, the agency and the facets every scoped query shares. */
const narrowingFields = {
  naics: codes(naics).default([]),
  psc: codes(psc).default([]),
  agency: z
    .string()
    .regex(/^\d{3,4}$/)
    .optional(),
  ...facetFields,
};

/** The scope every lens query shares. */
const scopeFields = {
  ...narrowingFields,
  awardFamily: z.enum(AWARD_FAMILY_CHOICES).default('both'),
};

/** An action-date window the source can answer: in order, and not before its first day. */
const overWindow = <T extends z.ZodType<{ from: string; to: string }>>(schema: T) =>
  schema
    .refine((query) => query.from <= query.to, {
      path: ['to'],
      message: 'to must not precede from',
    })
    .refine((query) => query.from >= fiscalYearStart(FIRST_FISCAL_YEAR), {
      path: ['from'],
      message: `the source begins on ${fiscalYearStart(FIRST_FISCAL_YEAR)}`,
    });

export const pulseQuerySchema = z.strictObject({
  ...scopeFields,
  lookback: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PULSE_LOOKBACK_YEARS)
    .default(DEFAULT_PULSE_LOOKBACK_YEARS),
}) satisfies z.ZodType<SpendingPulseQuery>;
export type PulseQueryInput = z.output<typeof pulseQuerySchema>;

export const breakdownQuerySchema = overWindow(
  z.strictObject({
    ...scopeFields,
    category: z.enum(BREAKDOWN_CATEGORIES),
    from: isoDate,
    to: isoDate,
  }),
) satisfies z.ZodType<SpendingBreakdownQuery>;
export type BreakdownQueryInput = z.output<typeof breakdownQuerySchema>;

/** Reach names no award family: it counts contracts. */
export const reachQuerySchema = overWindow(
  z.strictObject({
    ...narrowingFields,
    from: isoDate,
    to: isoDate,
    lanes: codes(setAside).default([]),
  }),
) satisfies z.ZodType<SpendingReachQuery>;
export type ReachQueryInput = z.output<typeof reachQuerySchema>;

export const primesQuerySchema = overWindow(
  z.strictObject({
    ...scopeFields,
    from: isoDate,
    to: isoDate,
    band: amountRange.optional(),
  }),
) satisfies z.ZodType<SpendingPrimesQuery>;
export type PrimesQueryInput = z.output<typeof primesQuerySchema>;

/** An award's id as the source mints it. */
export const awardIdSchema = z.string().regex(AWARD_ID_SHAPE, 'an award id is one path segment');

/** What a scope is read out of: any validated query's codes, agency, family and facets. */
export type ScopeInput = Pick<
  PulseQueryInput,
  'naics' | 'psc' | 'agency' | 'awardFamily' | FacetId
>;

export const horizonQuerySchema = z.strictObject({
  ...scopeFields,
  months: z.coerce.number().int().min(1).max(MAX_HORIZON_MONTHS).default(DEFAULT_HORIZON_MONTHS),
}) satisfies z.ZodType<SpendingHorizonQuery>;
export type HorizonQueryInput = z.output<typeof horizonQuerySchema>;

export const agencyOutlookQuerySchema = z.strictObject({
  fiscalYear: z.coerce.number().int().min(FIRST_FISCAL_YEAR).optional(),
  awardFamily: z.enum(AWARD_FAMILY_CHOICES).default('both'),
}) satisfies z.ZodType<AgencyOutlookQuery>;
export type AgencyOutlookQueryInput = z.output<typeof agencyOutlookQuerySchema>;

/** A toptier agency code, as USAspending spells it: three or four digits. */
export const toptierCodeSchema = z.string().regex(/^\d{3,4}$/);
