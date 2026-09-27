import { NOTICE_TYPES, type NoticeTypeCode } from '@sysdesign/contracts';
import { z } from 'zod';

/**
 * The search profile: everything the pull plan and the scorer read about one
 * company, as validated data. Codes are the company's NAICS and PSC families,
 * interests are declared phrases, `pull.slices` are the queries a pull runs in
 * priority order, and `scoring` prices every factor — through open maps
 * wherever an external vocabulary appears, so an unlisted set-aside or notice
 * type is priced by the profile's defaults and gates, never by code.
 *
 * `validateProfile` runs at boot, like `validatePipeline` in quality-loop: a
 * malformed profile fails before any request is spent.
 */

const unit = z.number().min(0).max(1);
const noticeTypeCodes = Object.keys(NOTICE_TYPES) as [NoticeTypeCode, ...NoticeTypeCode[]];

export const interestSchema = z.strictObject({
  term: z.string().min(2),
  aliases: z.array(z.string().min(2)),
  /** How much a match is worth; matched weights add up and cap at 1. */
  weight: z.number().gt(0).max(1),
});
export type Interest = z.infer<typeof interestSchema>;

/** One query a pull runs — the API's filters, minus the window and paging. */
export const sliceSchema = z.strictObject({
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
  title: z.string().min(1).optional(),
  solicitationNumber: z.string().min(1).optional(),
  noticeId: z.string().min(1).optional(),
  state: z.string().length(2).optional(),
  zip: z.string().min(3).optional(),
  organizationName: z.string().min(1).optional(),
  organizationCode: z.string().min(1).optional(),
  deadlineFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  deadlineTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type PullSlice = z.infer<typeof sliceSchema>;

export const searchProfileSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    company: z.string().min(1),
    /** NAICS codes or families, 2–6 digits; a shorter code is the whole family. */
    naics: z.array(z.string().regex(/^\d{2,6}$/)).min(1),
    /** PSC codes or families, 1–4 characters. */
    psc: z.array(z.string().regex(/^[A-Z0-9]{1,4}$/)),
    interests: z.array(interestSchema),
    pull: z.strictObject({
      slices: z.array(sliceSchema).min(1),
      pageSize: z.number().int().min(1).max(1000),
      maxPagesPerSlice: z.number().int().min(1),
    }),
    scoring: z.strictObject({
      /** One weight per factor id; they sum to 1. */
      weights: z.record(z.string(), unit),
      setAside: z.strictObject({
        /** Codes the company may bid on and how attractive each is; any other code excludes. */
        byCode: z.record(z.string(), unit),
        /** A notice with no set-aside: open competition. */
        unrestricted: unit,
      }),
      noticeType: z.strictObject({
        byType: z.record(z.string(), unit),
        default: unit,
        /** Types that are never a lead, e.g. an award already made. */
        exclude: z.array(z.string()),
      }),
      deadline: z.strictObject({
        /** Ascending by `maxDays`; the first band the days left fit takes it. */
        bands: z.array(z.strictObject({ maxDays: z.number().int().min(0), value: unit })).min(1),
        /** Further out than the last band. */
        beyond: unit,
        /** No deadline stated. */
        none: unit,
      }),
      tiers: z.strictObject({
        high: z.number().min(0).max(100),
        medium: z.number().min(0).max(100),
      }),
    }),
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
    const days = profile.scoring.deadline.bands.map((band) => band.maxDays);
    if (days.some((value, index) => index > 0 && value <= (days[index - 1] ?? 0))) {
      ctx.addIssue({
        code: 'custom',
        path: ['scoring', 'deadline', 'bands'],
        message: 'bands must ascend by maxDays',
      });
    }
    if (profile.scoring.tiers.high <= profile.scoring.tiers.medium) {
      ctx.addIssue({
        code: 'custom',
        path: ['scoring', 'tiers'],
        message: 'high must be above medium',
      });
    }
  });

export type SearchProfile = z.infer<typeof searchProfileSchema>;

/**
 * The profile as validated data, or an error naming every problem. `factorIds`
 * is the scorer's table: a weight for a factor that does not exist, or a
 * factor with no weight, is a profile that cannot be priced.
 */
export function validateProfile(candidate: unknown, factorIds: readonly string[]): SearchProfile {
  const name =
    typeof candidate === 'object' && candidate !== null && 'id' in candidate
      ? String((candidate as { id: unknown }).id)
      : '?';
  const parsed = searchProfileSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.') || '(root)'} ${issue.message}`,
    );
    throw new Error(`profile ${name}: ${issues.join('; ')}`);
  }
  const declared = Object.keys(parsed.data.scoring.weights).sort();
  const expected = [...factorIds].sort();
  if (declared.join(',') !== expected.join(',')) {
    throw new Error(
      `profile ${name}: scoring.weights must name exactly the factors ${expected.join(', ')} (got ${declared.join(', ') || 'none'})`,
    );
  }
  return parsed.data;
}
