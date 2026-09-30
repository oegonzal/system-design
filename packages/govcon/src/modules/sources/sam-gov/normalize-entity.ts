import type { EntityDraft } from '../../../core/ports';
import { samEntitySchema, type SamEntity } from './entity-schemas';

/** SAM.gov registrant → `EntityDraft`. Pure. A registrant needs a UEI and a legal name. */
const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const yesNo = (value: string | null | undefined): boolean | null => {
  const flag = clean(value)?.toUpperCase();
  return flag === 'Y' || flag === 'YES' ? true : flag === 'N' || flag === 'NO' ? false : null;
};

const codes = (
  items: readonly { code: string | null | undefined }[] | null | undefined,
): string[] => [
  ...new Set((items ?? []).map((item) => clean(item.code)).filter((c): c is string => c !== null)),
];

function shape(record: SamEntity, legalName: string): EntityDraft {
  const registration = record.entityRegistration;
  const types = record.coreData?.businessTypes;
  const goods = record.assertions?.goodsAndServices;
  return {
    uei: registration.ueiSAM,
    cage: clean(registration.cageCode),
    legalName,
    registrationStatus: clean(registration.registrationStatus),
    registrationExpiresAt: clean(registration.registrationExpirationDate)?.slice(0, 10) ?? null,
    businessTypes: codes(
      (types?.businessTypeList ?? []).map((t) => ({ code: t.businessTypeCode })),
    ),
    sbaCertifications: codes(
      (types?.sbaBusinessTypeList ?? []).map((t) => ({ code: t.sbaBusinessTypeCode })),
    ),
    naics: (goods?.naicsList ?? []).flatMap((item) => {
      const code = clean(item.naicsCode);
      return code === null ? [] : [{ code, small: yesNo(item.sbaSmallBusiness) }];
    }),
    psc: codes((goods?.pscList ?? []).map((p) => ({ code: p.pscCode }))),
    excluded: yesNo(registration.exclusionStatusFlag) === true,
  };
}

export type NormalizedEntity = { ok: true; entity: EntityDraft } | { ok: false; reason: string };

export function normalizeSamEntity(raw: unknown): NormalizedEntity {
  const parsed = samEntitySchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, reason: parsed.error.issues[0]?.message ?? 'unreadable' };
  const legalName =
    clean(parsed.data.entityRegistration.legalBusinessName) ??
    clean(parsed.data.entityRegistration.dbaName);
  if (legalName === null) return { ok: false, reason: 'legalBusinessName: missing' };
  return { ok: true, entity: shape(parsed.data, legalName) };
}
