import {
  COMPANY_FACET,
  identityKey,
  type ApplicationDto,
  type ApplicationSource,
  type ApplicationStatus,
  type UnitFacet,
} from '@sysdesign/contracts';

/** One application as the record keeps it. */
export interface Application {
  id: string;
  subject: string;
  company: string;
  identityKey: string;
  label: string;
  url: string | null;
  source: ApplicationSource;
  sessionId: string | null;
  profile: string | null;
  unitOrdinal: number | null;
  status: ApplicationStatus;
  openedAt: Date;
  closedAt: Date | null;
  expiresAt: Date | null;
}

/** The contracts' key of a company: the one every process compares the facet by. */
export const companyKey = (company: string): string =>
  identityKey([{ name: COMPANY_FACET, value: company }]);

/** The company a unit's facets name, or null when the mission declared none. */
export const companyOf = (facets: readonly UnitFacet[]): string | null =>
  facets.find((facet) => facet.name === COMPANY_FACET)?.value ?? null;

/** When the application last moved: its close, else its open. */
export const movedAt = (application: Application): Date =>
  application.closedAt ?? application.openedAt;

export const applicationDto = (application: Application): ApplicationDto => ({
  id: application.id,
  subject: application.subject,
  company: application.company,
  label: application.label,
  url: application.url,
  source: application.source,
  sessionId: application.sessionId,
  profile: application.profile,
  unitOrdinal: application.unitOrdinal,
  status: application.status,
  openedAt: application.openedAt.toISOString(),
  closedAt: application.closedAt?.toISOString() ?? null,
  expiresAt: application.expiresAt?.toISOString() ?? null,
});
