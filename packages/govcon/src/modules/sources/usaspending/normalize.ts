import { dottedPath } from '../../../core/agency-path';
import type { AwardDraft } from '../../../core/ports';
import { spendingAwardSchema, type SpendingAward } from './schemas';
import { amount, clean, day } from './values';

/**
 * USAspending award → `AwardDraft`. Pure. An award needs its id and the day it
 * was signed — the base obligation date, or the start of performance when
 * the source gave no other. Agency codes are `toptier.subtier`, so the
 * subtier is what relates the award to a notice's buyer, as SAM.gov's are.
 */

function shape(record: SpendingAward, signedAt: string): AwardDraft {
  const agency = clean(record['Awarding Agency']);
  const subAgency = clean(record['Awarding Sub Agency']);
  return {
    source: 'usaspending',
    externalId: record.generated_internal_id,
    piid: clean(record['Award ID']),
    awardType: clean(record['Contract Award Type']),
    solicitationNumber: null,
    naicsCode: clean(record.NAICS?.code),
    pscCode: clean(record.PSC?.code),
    agencyPath: dottedPath([agency, subAgency]),
    agencyCode: dottedPath([
      clean(record['Awarding Agency Code']),
      clean(record['Awarding Sub Agency Code']),
    ]),
    awardeeName: clean(record['Recipient Name']),
    awardeeUei: clean(record['Recipient UEI']),
    amount: amount(record['Award Amount']),
    offersReceived: null,
    extentCompeted: null,
    setAsideCode: null,
    signedAt,
    popStartAt: day(record['Start Date']),
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
  const signedAt = day(parsed.data['Base Obligation Date']) ?? day(parsed.data['Start Date']);
  if (signedAt === null)
    return { ok: false, reason: 'Base Obligation Date: missing or unreadable' };
  return { ok: true, award: shape(parsed.data, signedAt) };
}
