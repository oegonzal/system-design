import type { AwardDraft } from '../../../core/ports';
import { spendingAwardSchema, type SpendingAward } from './schemas';

/** USAspending award → `AwardDraft`. Pure. An award needs its id and a start date (its signing, as far as this source says). */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const day = (value: string | null | undefined): string | null => {
  const cleaned = clean(value);
  return cleaned !== null &&
    ISO_DAY.test(cleaned) &&
    !Number.isNaN(Date.parse(cleaned.slice(0, 10)))
    ? cleaned.slice(0, 10)
    : null;
};

const amount = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[,$\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

function shape(record: SpendingAward, signedAt: string): AwardDraft {
  const agency = clean(record['Awarding Agency']);
  const subAgency = clean(record['Awarding Sub Agency']);
  return {
    source: 'usaspending',
    externalId: record.generated_internal_id,
    solicitationNumber: null,
    naicsCode: clean(record.NAICS?.code),
    pscCode: clean(record.PSC?.code),
    agencyPath:
      [agency, subAgency].filter((part): part is string => part !== null).join('.') || null,
    agencyCode: null,
    awardeeName: clean(record['Recipient Name']),
    awardeeUei: clean(record['Recipient UEI']),
    amount: amount(record['Award Amount']),
    offersReceived: null,
    extentCompeted: null,
    setAsideCode: null,
    signedAt,
    completionAt: day(record['End Date']),
    placeOfPerformance: {
      city: clean(record['Place of Performance City Name']),
      state: clean(record['Place of Performance State Code']),
      zip: null,
      country: null,
    },
  };
}

export type NormalizedSpending = { ok: true; award: AwardDraft } | { ok: false; reason: string };

export function normalizeSpendingAward(raw: unknown): NormalizedSpending {
  const parsed = spendingAwardSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, reason: parsed.error.issues[0]?.message ?? 'unreadable' };
  const signedAt = day(parsed.data['Start Date']);
  if (signedAt === null) return { ok: false, reason: 'Start Date: missing or unreadable' };
  return { ok: true, award: shape(parsed.data, signedAt) };
}
