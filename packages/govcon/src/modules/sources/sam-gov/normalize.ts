import type { Opportunity } from '@sysdesign/contracts';

import type { RejectedRecord } from '../../../core/ports';
import { samRecordSchema, type SamRecord } from './schemas';

/**
 * SAM.gov record → `Opportunity`. Pure: no clock, no I/O. A record needs a
 * notice id and a readable posted date to become a lead; everything else is
 * carried when present and null when not. Rejections name the record and the
 * reasons so the pull report can count them.
 */

const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})$/;
const SPACE_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * SAM.gov spells dates three ways: `2026-09-20`, `2026-09-20 14:03:11` and
 * ISO 8601 with an offset. The first two carry no zone; they are read as UTC,
 * which orders records correctly and is at most a few hours off the Eastern
 * clock the provider actually keeps. Nothing else is read: the runtime's
 * fallback parser would take `09/20/2026` in the machine's zone, and a
 * normalizer must not depend on where it runs.
 */
export function parseSamDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const dateOnly = DATE_ONLY.exec(trimmed);
  const spaced = SPACE_DATETIME.exec(trimmed);
  const candidate = dateOnly
    ? `${dateOnly[1]}T00:00:00Z`
    : spaced
      ? `${spaced[1]}T${spaced[2]}Z`
      : ISO_DATETIME.test(trimmed)
        ? trimmed
        : null;
  if (candidate === null) return null;
  const ms = Date.parse(candidate);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const yesNo = (value: string | null | undefined): boolean | null => {
  const flag = clean(value)?.toLowerCase();
  return flag === 'yes' ? true : flag === 'no' ? false : null;
};

const amount = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[,$\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

function shape(record: SamRecord, postedAt: string, source: string): Opportunity {
  const codes = [
    ...new Set(
      [record.naicsCode, ...(record.naicsCodes ?? [])]
        .map(clean)
        .filter((code): code is string => code !== null),
    ),
  ];
  const place = record.placeOfPerformance;
  const office = record.officeAddress;
  const award = record.award;
  return {
    noticeId: record.noticeId,
    title: clean(record.title) ?? clean(record.solicitationNumber) ?? record.noticeId,
    solicitationNumber: clean(record.solicitationNumber),
    agencyPath: clean(record.fullParentPathName),
    agencyCode: clean(record.fullParentPathCode),
    postedAt,
    responseDeadlineAt: parseSamDate(record.responseDeadLine),
    archiveAt: parseSamDate(record.archiveDate),
    archiveType: clean(record.archiveType),
    noticeType: clean(record.type),
    baseType: clean(record.baseType),
    active: yesNo(record.active),
    naicsCode: codes[0] ?? null,
    naicsCodes: codes,
    classificationCode: clean(record.classificationCode),
    setAsideCode: clean(record.typeOfSetAside),
    setAsideDescription: clean(record.typeOfSetAsideDescription),
    organizationType: clean(record.organizationType),
    placeOfPerformance: place
      ? {
          city: clean(place.city?.name),
          state: clean(place.state?.code),
          zip: clean(place.zip),
          country: clean(place.country?.code),
        }
      : null,
    officeAddress: office
      ? {
          city: clean(office.city),
          state: clean(office.state),
          zip: clean(office.zip) ?? clean(office.zipcode),
          countryCode: clean(office.countryCode),
        }
      : null,
    pointsOfContact: (record.pointOfContact ?? []).map((contact) => ({
      type: clean(contact.type),
      title: clean(contact.title),
      fullName: clean(contact.fullName),
      email: clean(contact.email),
      phone: clean(contact.phone),
    })),
    descriptionUrl: clean(record.description),
    uiLink: clean(record.uiLink),
    additionalInfoLink: clean(record.additionalInfoLink),
    resourceLinks: (record.resourceLinks ?? []).map(clean).filter((l): l is string => l !== null),
    award: award
      ? {
          date: parseSamDate(award.date),
          number: clean(award.number),
          amount: amount(award.amount),
          awardeeName: clean(award.awardee?.name),
          awardeeUei: clean(award.awardee?.ueiSAM),
        }
      : null,
    source,
  };
}

export type Normalized =
  { ok: true; opportunity: Opportunity } | { ok: false; rejected: RejectedRecord };

export function normalizeRecord(raw: unknown, source: string): Normalized {
  const parsed = samRecordSchema.safeParse(raw);
  const noticeId =
    typeof raw === 'object' &&
    raw !== null &&
    typeof (raw as { noticeId?: unknown }).noticeId === 'string'
      ? (raw as { noticeId: string }).noticeId
      : null;
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.') || '(record)'}: ${issue.message}`,
    );
    return { ok: false, rejected: { noticeId, issues } };
  }
  const postedAt = parseSamDate(parsed.data.postedDate);
  if (postedAt === null) {
    return {
      ok: false,
      rejected: { noticeId: parsed.data.noticeId, issues: ['postedDate: missing or unreadable'] },
    };
  }
  return { ok: true, opportunity: shape(parsed.data, postedAt, source) };
}

/** Every record on a page, split into what normalized and what did not. */
export function normalizePage(
  records: readonly unknown[],
  source: string,
): { opportunities: Opportunity[]; rejected: RejectedRecord[] } {
  const opportunities: Opportunity[] = [];
  const rejected: RejectedRecord[] = [];
  for (const raw of records) {
    const result = normalizeRecord(raw, source);
    if (result.ok) opportunities.push(result.opportunity);
    else rejected.push(result.rejected);
  }
  return { opportunities, rejected };
}
