import type { Opportunity } from '@sysdesign/contracts';
import type { GovconOpportunity } from '@sysdesign/db';

/**
 * Row ⇄ `Opportunity`, pure so the round trip is unit-tested without a
 * database. ISO strings become Dates on the way in and back on the way out;
 * `firstSeenAt` is set to `seenAt` here and excluded from the upsert's merge,
 * so it survives every later pull while `lastSeenAt` advances.
 */
const date = (iso: string | null): Date | null => (iso === null ? null : new Date(iso));
const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

/** Everything a pull writes. The description columns are deliberately absent: an upsert must never clear them. */
export type OpportunityRow = Omit<GovconOpportunity, 'descriptionText' | 'descriptionFetchedAt'>;

export function toRow(o: Opportunity, seenAt: Date): OpportunityRow {
  return {
    noticeId: o.noticeId,
    title: o.title,
    solicitationNumber: o.solicitationNumber,
    agencyPath: o.agencyPath,
    agencyCode: o.agencyCode,
    postedAt: new Date(o.postedAt),
    responseDeadlineAt: date(o.responseDeadlineAt),
    archiveAt: date(o.archiveAt),
    archiveType: o.archiveType,
    noticeType: o.noticeType,
    baseType: o.baseType,
    active: o.active,
    naicsCode: o.naicsCode,
    naicsCodes: [...o.naicsCodes],
    classificationCode: o.classificationCode,
    setAsideCode: o.setAsideCode,
    setAsideDescription: o.setAsideDescription,
    organizationType: o.organizationType,
    placeOfPerformance: o.placeOfPerformance ? { ...o.placeOfPerformance } : null,
    officeAddress: o.officeAddress ? { ...o.officeAddress } : null,
    pointsOfContact: o.pointsOfContact.map((contact) => ({ ...contact })),
    descriptionUrl: o.descriptionUrl,
    uiLink: o.uiLink,
    additionalInfoLink: o.additionalInfoLink,
    resourceLinks: [...o.resourceLinks],
    award: o.award ? { ...o.award } : null,
    source: o.source,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
  };
}

export function fromRow(row: OpportunityRow): Opportunity {
  return {
    noticeId: row.noticeId,
    title: row.title,
    solicitationNumber: row.solicitationNumber,
    agencyPath: row.agencyPath,
    agencyCode: row.agencyCode,
    postedAt: row.postedAt.toISOString(),
    responseDeadlineAt: iso(row.responseDeadlineAt),
    archiveAt: iso(row.archiveAt),
    archiveType: row.archiveType,
    noticeType: row.noticeType,
    baseType: row.baseType,
    active: row.active,
    naicsCode: row.naicsCode,
    naicsCodes: [...row.naicsCodes],
    classificationCode: row.classificationCode,
    setAsideCode: row.setAsideCode,
    setAsideDescription: row.setAsideDescription,
    organizationType: row.organizationType,
    placeOfPerformance: row.placeOfPerformance ? { ...row.placeOfPerformance } : null,
    officeAddress: row.officeAddress ? { ...row.officeAddress } : null,
    pointsOfContact: row.pointsOfContact.map((contact) => ({ ...contact })),
    descriptionUrl: row.descriptionUrl,
    uiLink: row.uiLink,
    additionalInfoLink: row.additionalInfoLink,
    resourceLinks: [...row.resourceLinks],
    award: row.award ? { ...row.award } : null,
    source: row.source,
  };
}
