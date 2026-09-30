/**
 * A contract opportunity as the govcon package stores and ranks it: SAM.gov's
 * record normalized once — dates as ISO strings, codes as the source spelled
 * them, nested objects flattened to what a lead needs. This is the shape
 * every other layer reads; nothing keeps the provider's record as received.
 */

/** Where the work is performed, as codes and names SAM.gov supplies. */
export interface OpportunityPlace {
  city: string | null;
  /** State code (`CA`), when given. */
  state: string | null;
  zip: string | null;
  /** Country code (`USA`), when given. */
  country: string | null;
}

/** The contracting office's address. */
export interface OpportunityOffice {
  city: string | null;
  state: string | null;
  zip: string | null;
  countryCode: string | null;
}

export interface OpportunityContact {
  /** `primary` / `secondary` as SAM.gov labels them. */
  type: string | null;
  title: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
}

/** Present on award notices only. */
export interface OpportunityAward {
  date: string | null;
  number: string | null;
  amount: number | null;
  awardeeName: string | null;
  awardeeUei: string | null;
}

export interface Opportunity {
  /** SAM.gov's notice id — the natural key a re-pull upserts on. */
  noticeId: string;
  title: string;
  solicitationNumber: string | null;
  /** `fullParentPathName`: department › sub-tier › office. */
  agencyPath: string | null;
  /** `fullParentPathCode`. */
  agencyCode: string | null;
  /** ISO 8601. */
  postedAt: string;
  /** ISO 8601, when the notice states a response deadline. */
  responseDeadlineAt: string | null;
  archiveAt: string | null;
  archiveType: string | null;
  /** SAM.gov's label, e.g. `Solicitation`, `Sources Sought` — open by design. */
  noticeType: string | null;
  baseType: string | null;
  /** `Yes`/`No` upstream; null when the record does not say. */
  active: boolean | null;
  naicsCode: string | null;
  naicsCodes: string[];
  /** Product/service code (PSC). */
  classificationCode: string | null;
  /** `typeOfSetAside`, e.g. `SBA`; null means unrestricted. */
  setAsideCode: string | null;
  setAsideDescription: string | null;
  organizationType: string | null;
  placeOfPerformance: OpportunityPlace | null;
  officeAddress: OpportunityOffice | null;
  pointsOfContact: OpportunityContact[];
  /** The description endpoint's URL — text is a separate, budgeted request. */
  descriptionUrl: string | null;
  /** The human page on sam.gov. */
  uiLink: string | null;
  additionalInfoLink: string | null;
  /** Attachment URLs; each download is a budgeted request through the service. */
  resourceLinks: string[];
  award: OpportunityAward | null;
  /** Which source produced the record, e.g. `sam.gov`. */
  source: string;
}
