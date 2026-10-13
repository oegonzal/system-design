import {
  AWARD_FAMILY_CHOICES,
  BREAKDOWN_CATEGORIES,
  DEFAULT_HORIZON_MONTHS,
  DEFAULT_PULSE_LOOKBACK_YEARS,
  FIRST_FISCAL_YEAR,
  fiscalYearStart,
  MAX_HORIZON_MONTHS,
  MAX_PULSE_LOOKBACK_YEARS,
  MAX_SCOPE_CODES,
  type AgencyOutlookQuery,
  type SpendingBreakdownQuery,
  type SpendingHorizonQuery,
  type SpendingPulseQuery,
} from '@sysdesign/contracts';
import { z } from 'zod';

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

/** The scope every lens query shares. */
const scopeFields = {
  naics: codes(naics).default([]),
  psc: codes(psc).default([]),
  agency: z
    .string()
    .regex(/^\d{3,4}$/)
    .optional(),
  awardFamily: z.enum(AWARD_FAMILY_CHOICES).default('both'),
};

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

export const breakdownQuerySchema = z
  .strictObject({
    ...scopeFields,
    category: z.enum(BREAKDOWN_CATEGORIES),
    from: isoDate,
    to: isoDate,
  })
  .refine((query) => query.from <= query.to, {
    path: ['to'],
    message: 'to must not precede from',
  })
  .refine((query) => query.from >= fiscalYearStart(FIRST_FISCAL_YEAR), {
    path: ['from'],
    message: `the source begins on ${fiscalYearStart(FIRST_FISCAL_YEAR)}`,
  }) satisfies z.ZodType<SpendingBreakdownQuery>;
export type BreakdownQueryInput = z.output<typeof breakdownQuerySchema>;

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
