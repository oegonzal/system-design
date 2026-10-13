import {
  AWARD_FAMILY_CHOICES,
  BREAKDOWN_CATEGORIES,
  HORIZON_STOPS,
  type AgencyDirectory,
  type AgencyOutlook,
  type HorizonBody,
  type SpendingBreakdown,
  type SpendingPulse,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { LensBody } from './lens';

/**
 * What a stored lens body must still be before it is served: strict shapes,
 * finite numbers, the vocabularies closed. A snapshot written by an earlier
 * build that no longer matches is refused and refetched, never trusted.
 */
const amount = z.number().finite();
const count = z.number().int().min(0);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const code = z.string().min(1);
const label = z.string();

const scopeSchema = z.strictObject({
  naics: z.array(code),
  psc: z.array(code),
  agency: code.nullable(),
  awardFamily: z.enum(AWARD_FAMILY_CHOICES),
});

const fiscalPeriod = { fiscalYear: z.number().int(), period: z.number().int().min(1).max(12) };

const publicationDelay = z
  .strictObject({ agencies: z.array(label), days: count, completeThrough: isoDate })
  .nullable();

export const pulseBodySchema = z.strictObject({
  scope: scopeSchema,
  fiscalYear: z.number().int(),
  series: z.array(
    z.strictObject({
      ...fiscalPeriod,
      contracts: amount,
      idvs: amount,
      total: amount,
      partial: z.boolean(),
      unpublished: z.boolean(),
    }),
  ),
  projection: z
    .strictObject({
      method: z.literal('seasonal-mean'),
      lookbackFiscalYears: z.array(z.number().int()),
      basePeriods: count,
      ratio: amount.nullable(),
      periods: z.array(
        z.strictObject({
          ...fiscalPeriod,
          expected: amount,
          scaled: amount.nullable(),
          low: amount,
          high: amount,
        }),
      ),
    })
    .nullable(),
  delay: publicationDelay,
}) satisfies z.ZodType<LensBody<SpendingPulse>>;

export const breakdownBodySchema = z.strictObject({
  scope: scopeSchema,
  category: z.enum(BREAKDOWN_CATEGORIES),
  from: isoDate,
  to: isoDate,
  total: amount,
  rows: z.array(
    z.strictObject({
      id: label.nullable(),
      code: label.nullable(),
      name: label,
      amount,
      share: amount,
    }),
  ),
  truncated: z.boolean(),
  delay: publicationDelay,
}) satisfies z.ZodType<LensBody<SpendingBreakdown>>;

const familyTotals = z.strictObject({ count, amount });

export const horizonBodySchema = z.strictObject({
  scope: scopeSchema,
  today: isoDate,
  months: z.number().int().min(1),
  buckets: z.array(
    z.strictObject({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      contracts: familyTotals,
      idvs: familyTotals,
    }),
  ),
  rows: z.array(
    z.strictObject({
      externalId: code,
      piid: label.nullable(),
      family: z.enum(['contracts', 'idvs']),
      typeDescription: label.nullable(),
      recipientName: label.nullable(),
      recipientUei: label.nullable(),
      amount,
      endsAt: isoDate,
      agencyPath: label.nullable(),
      agencyCode: label.nullable(),
      naicsCode: label.nullable(),
      pscCode: label.nullable(),
      description: label.nullable(),
    }),
  ),
  capped: z.boolean(),
  stoppedBy: z.enum(HORIZON_STOPS).nullable(),
  completeBefore: isoDate.nullable(),
}) satisfies z.ZodType<HorizonBody>;

const directoryEntry = z.strictObject({
  agencyId: z.number().int(),
  toptierCode: code,
  abbreviation: label,
  name: label,
  budgetAuthority: amount,
  obligated: amount,
  outlayed: amount,
  activeFiscalYear: z.number().int().nullable(),
  activeQuarter: z.number().int().nullable(),
});

export const directoryBodySchema = z.strictObject({
  entries: z.array(directoryEntry),
}) satisfies z.ZodType<LensBody<AgencyDirectory>>;

const office = z.strictObject({
  code: label.nullable(),
  name: label,
  obligations: amount,
  transactions: count,
  newAwards: count,
});

export const agencyBodySchema = z.strictObject({
  toptierCode: code,
  name: label,
  abbreviation: label.nullable(),
  years: z.array(
    z.strictObject({
      fiscalYear: z.number().int(),
      budgetaryResources: amount.nullable(),
      obligated: amount.nullable(),
      outlayed: amount.nullable(),
      byPeriod: z.array(z.strictObject({ period: z.number().int(), obligated: amount })),
    }),
  ),
  officesFiscalYear: z.number().int(),
  awardFamily: z.enum(AWARD_FAMILY_CHOICES),
  subAgencies: z.array(office.extend({ abbreviation: label.nullable(), offices: z.array(office) })),
  truncated: z.boolean(),
}) satisfies z.ZodType<LensBody<AgencyOutlook>>;

export const freshnessBodySchema = z.strictObject({ lastUpdated: isoDate });
export type FreshnessBody = z.output<typeof freshnessBodySchema>;
