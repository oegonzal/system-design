import type { ApiResponse } from '../envelope';

/** A NAICS code an entity registered, and whether SBA sizes it small there. */
export interface EntityNaics {
  code: string;
  small: boolean | null;
}

/**
 * A SAM.gov registrant as stored: Entity Management's registration, core
 * data and assertions reduced to what a bidder asks — is it registered, until
 * when, what it claims, and (when checked) whether it is excluded.
 */
export interface Entity {
  uei: string;
  cage: string | null;
  legalName: string;
  registrationStatus: string | null;
  /** ISO date. */
  registrationExpiresAt: string | null;
  businessTypes: string[];
  sbaCertifications: string[];
  naics: EntityNaics[];
  psc: string[];
  parentUei: string | null;
  parentName: string | null;
  /** null until the exclusions list was asked. */
  excluded: boolean | null;
  exclusionCheckedAt: string | null;
  /** ISO 8601. */
  fetchedAt: string;
}

/** `POST /entities/lookup`: up to `MAX_UEI_BATCH` UEIs in one request, plus one exclusions request each when asked. */
export interface LookupEntitiesRequest {
  ueis: string[];
  exclusions: boolean;
}

export type GetEntityResponse = ApiResponse<Entity | null>;
export type LookupEntitiesResponse = ApiResponse<Entity[]>;
