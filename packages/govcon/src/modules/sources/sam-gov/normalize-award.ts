import { dottedPath } from '../../../core/agency-path';
import type { AwardDraft } from '../../../core/ports';
import { samAwardSchema, type SamAward } from './award-schemas';
import { parseSamDate } from './normalize';

/**
 * SAM.gov award record → `AwardDraft`. Pure. An award needs its contract id
 * and a signed date; everything else is carried when present and null when
 * not. `NONE` is how the provider spells "no set-aside".
 */
const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== 'N/A' ? trimmed : null;
};

const amount = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[,$\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const integer = (value: number | string | null | undefined): number | null => {
  const parsed = amount(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const isoDay = (value: string | null | undefined): string | null =>
  parseSamDate(value)?.slice(0, 10) ?? null;

function shape(record: SamAward, signedAt: string, source: AwardDraft['source']): AwardDraft {
  const contracting = record.coreData?.federalOrganization?.contractingInformation;
  const place = record.coreData?.principalPlaceOfPerformance;
  const products = record.coreData?.productOrServiceInformation;
  const setAside = clean(record.coreData?.competitionInformation?.typeOfSetAside?.code);
  const modification = clean(record.contractId.modificationNumber) ?? '0';
  return {
    source,
    externalId: `${record.contractId.piid}-${modification}`,
    piid: record.contractId.piid,
    awardType: clean(record.coreData?.awardOrIDVType?.name),
    solicitationNumber: clean(record.coreData?.solicitationId),
    naicsCode: clean(products?.principalNaics?.[0]?.code),
    pscCode: clean(products?.productOrService?.code),
    agencyPath: dottedPath([
      clean(contracting?.contractingDepartment?.name),
      clean(contracting?.contractingSubtier?.name),
      clean(contracting?.contractingOffice?.name),
    ]),
    agencyCode: dottedPath([
      clean(contracting?.contractingDepartment?.code),
      clean(contracting?.contractingSubtier?.code),
      clean(contracting?.contractingOffice?.code),
    ]),
    awardeeName:
      clean(record.awardDetails?.awardeeData?.awardeeHeader?.awardeeName) ??
      clean(record.awardDetails?.awardeeData?.awardeeHeader?.legalBusinessName),
    awardeeUei: clean(record.awardDetails?.awardeeData?.awardeeUEIInformation?.uniqueEntityId),
    amount: amount(record.awardDetails?.dollars?.actionObligation),
    offersReceived: integer(record.awardDetails?.competitionInformation?.numberOfOffersReceived),
    extentCompeted: clean(record.coreData?.competitionInformation?.extentCompeted?.code),
    setAsideCode: setAside === 'NONE' ? null : setAside,
    signedAt,
    popStartAt: isoDay(record.awardDetails?.dates?.periodOfPerformanceStartDate),
    completionAt:
      isoDay(record.awardDetails?.dates?.ultimateCompletionDate) ??
      isoDay(record.awardDetails?.dates?.currentCompletionDate),
    placeOfPerformance: place
      ? {
          city: clean(place.city?.name),
          state: clean(place.state?.code),
          zip: clean(place.zipCode),
          country: clean(place.country?.code),
        }
      : null,
  };
}

export type NormalizedAward = { ok: true; award: AwardDraft } | { ok: false; reason: string };

export function normalizeSamAward(raw: unknown, source: AwardDraft['source']): NormalizedAward {
  const parsed = samAwardSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, reason: parsed.error.issues[0]?.message ?? 'unreadable' };
  const signedAt = isoDay(parsed.data.awardDetails?.dates?.dateSigned);
  if (signedAt === null) return { ok: false, reason: 'dateSigned: missing or unreadable' };
  return { ok: true, award: shape(parsed.data, signedAt, source) };
}
