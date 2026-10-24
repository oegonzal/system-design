import {
  ALERT_AUDIENCES,
  DEFAULT_ALERT_POLICY,
  DEFAULT_TEAMING_POLICY,
  FACTOR_IDS,
  LEAD_TIERS,
  MAX_ALERT_ENDING_DAYS,
  MAX_FOLLOW_UP_BUSINESS_DAYS,
  MAX_PAGE_SIZE,
  MAX_PULL_DAYS,
  NOTICE_STATUSES,
  NOTICE_TYPES,
  UEI_SHAPE,
  type FactorId,
  type NoticeTypeCode,
  type QueryFilter,
  type SearchProfile,
} from '@sysdesign/contracts';
import { z } from 'zod';

/**
 * The search profile's validator. The shape is the wire type `SearchProfile`
 * in contracts (the web client reads and edits it); this schema is checked
 * against it in both directions — `satisfies` here, `expectTypeOf` in the
 * spec — so the two cannot drift. Prices are open maps wherever an external
 * vocabulary appears; the weights are closed over the scorer's factor ids,
 * so a profile that cannot be priced is refused with the path named.
 *
 * `validateProfile` runs at the seed and on every read; `parseProfile`
 * answers the issues a client shows per field.
 */
export type { SearchProfile };

const unit = z.number().min(0).max(1);
const noticeTypeCodes = Object.keys(NOTICE_TYPES) as [NoticeTypeCode, ...NoticeTypeCode[]];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const interestSchema = z.strictObject({
  term: z.string().min(2),
  aliases: z.array(z.string().min(2)),
  /** How much a match is worth; matched weights add up and cap at 1. */
  weight: z.number().gt(0).max(1),
});

/** One search's filters — a saved search, an ad hoc run — the API's parameters minus window and paging. */
export const queryFilterSchema = z.strictObject({
  noticeType: z.enum(noticeTypeCodes).optional(),
  naics: z
    .string()
    .regex(/^\d{2,6}$/)
    .optional(),
  psc: z
    .string()
    .regex(/^[A-Z0-9]{1,4}$/)
    .optional(),
  setAside: z.string().min(1).optional(),
  status: z.enum(NOTICE_STATUSES).optional(),
  title: z.string().min(1).optional(),
  solicitationNumber: z.string().min(1).optional(),
  noticeId: z.string().min(1).optional(),
  state: z.string().length(2).optional(),
  zip: z.string().min(3).optional(),
  organizationName: z.string().min(1).optional(),
  organizationCode: z.string().min(1).optional(),
  deadlineFrom: isoDate.optional(),
  deadlineTo: isoDate.optional(),
}) satisfies z.ZodType<QueryFilter>;

const dayBands = z.array(z.strictObject({ maxDays: z.number().int().min(0), value: unit })).min(1);

const ascending = (bands: readonly { maxDays: number }[]): boolean =>
  bands.every((band, index) => index === 0 || band.maxDays > (bands[index - 1]?.maxDays ?? 0));

/** One weight per factor, no more, no fewer — the record is closed over `FACTOR_IDS`. */
const weightsSchema = z.strictObject(
  Object.fromEntries(FACTOR_IDS.map((id) => [id, unit])) as Record<FactorId, typeof unit>,
);

/** What is raised for a person; a document from before the policy, or before one of its fields, reads as the declared default. */
const alertPolicySchema = z.strictObject({
  endingWithinDays: z.number().int().min(0).max(MAX_ALERT_ENDING_DAYS),
  pulseAboveBand: z.boolean(),
  audience: z.enum(ALERT_AUDIENCES).default(DEFAULT_ALERT_POLICY.audience),
  minObligated: z.number().min(0).default(DEFAULT_ALERT_POLICY.minObligated),
  newLeadTier: z.enum(LEAD_TIERS).nullable().default(DEFAULT_ALERT_POLICY.newLeadTier),
  followUpAfterBusinessDays: z
    .number()
    .int()
    .min(0)
    .max(MAX_FOLLOW_UP_BUSINESS_DAYS)
    .default(DEFAULT_ALERT_POLICY.followUpAfterBusinessDays),
});

/** The size of subcontract the company could take; a document from before the policy reads as the declared default. */
const teamingPolicySchema = z.strictObject({
  subcontract: z.strictObject({ min: z.number().min(0), max: z.number().min(0) }),
});

export const searchProfileSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    company: z.string().min(1),
    entityUei: z.string().regex(UEI_SHAPE).nullable(),
    /** NAICS codes or families, 2–6 digits; a shorter code is the whole family. */
    naics: z.array(z.string().regex(/^\d{2,6}$/)).min(1),
    /** PSC codes or families, 1–4 characters. */
    psc: z.array(z.string().regex(/^[A-Z0-9]{1,4}$/)),
    interests: z.array(interestSchema),
    pull: z.strictObject({
      pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
      maxPagesPerSlice: z.number().int().min(1),
    }),
    leads: z.strictObject({
      horizonDays: z
        .number()
        .int()
        .min(1)
        .max(MAX_PULL_DAYS * 10),
    }),
    scoring: z.strictObject({
      weights: weightsSchema,
      setAside: z.strictObject({
        byCode: z.record(z.string(), unit),
        unrestricted: unit,
      }),
      noticeType: z.strictObject({
        byType: z.record(z.string(), unit),
        default: unit,
        exclude: z.array(z.string()),
      }),
      deadline: z.strictObject({ bands: dayBands, beyond: unit, none: unit }),
      history: z.strictObject({
        days: z.number().int().min(1),
        saturateAt: z.number().int().min(1),
      }),
      freshness: z.strictObject({ bands: dayBands, beyond: unit }),
      tiers: z.strictObject({
        high: z.number().min(0).max(100),
        medium: z.number().min(0).max(100),
      }),
    }),
    alerts: alertPolicySchema.default(DEFAULT_ALERT_POLICY),
    teaming: teamingPolicySchema.default(DEFAULT_TEAMING_POLICY),
  })
  .superRefine((profile, ctx) => {
    const sum = Object.values(profile.scoring.weights).reduce((total, weight) => total + weight, 0);
    if (Math.abs(sum - 1) > 1e-6) {
      ctx.addIssue({
        code: 'custom',
        path: ['scoring', 'weights'],
        message: `weights sum to ${sum}, not 1`,
      });
    }
    for (const [name, bands] of [
      ['deadline', profile.scoring.deadline.bands],
      ['freshness', profile.scoring.freshness.bands],
    ] as const) {
      if (!ascending(bands)) {
        ctx.addIssue({
          code: 'custom',
          path: ['scoring', name, 'bands'],
          message: 'bands must ascend by maxDays',
        });
      }
    }
    if (profile.teaming.subcontract.min > profile.teaming.subcontract.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['teaming', 'subcontract'],
        message: 'the smallest subcontract must not be above the largest',
      });
    }
    if (profile.scoring.tiers.high <= profile.scoring.tiers.medium) {
      ctx.addIssue({
        code: 'custom',
        path: ['scoring', 'tiers'],
        message: 'high must be above medium',
      });
    }
  }) satisfies z.ZodType<SearchProfile>;

export interface ProfileIssue {
  /** Dotted; empty for the root. */
  path: string;
  message: string;
}

export type ParsedProfile =
  { ok: true; profile: SearchProfile } | { ok: false; issues: ProfileIssue[] };

/** The profile as validated data, or every problem with its path — what a form shows per field. */
export function parseProfile(candidate: unknown): ParsedProfile {
  const parsed = searchProfileSchema.safeParse(candidate);
  return parsed.success
    ? { ok: true, profile: parsed.data }
    : {
        ok: false,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      };
}

/** The profile as validated data, or an Error naming every problem — for the seed and the store's reads. */
export function validateProfile(candidate: unknown): SearchProfile {
  const name =
    typeof candidate === 'object' && candidate !== null && 'id' in candidate
      ? String((candidate as { id: unknown }).id)
      : '?';
  const parsed = parseProfile(candidate);
  if (!parsed.ok) {
    const issues = parsed.issues.map((issue) => `${issue.path || '(root)'} ${issue.message}`);
    throw new Error(`profile ${name}: ${issues.join('; ')}`);
  }
  return parsed.profile;
}
