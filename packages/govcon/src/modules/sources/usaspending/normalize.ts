import type { AwardDraft } from '../../../core/ports';
import { spendingAwardSchema, type SpendingAward } from './schemas';
import { amount, clean, day } from './values';

/** USAspending award → `AwardDraft`. Pure. An award needs its id and a start date (its signing, as far as this source says). */

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
