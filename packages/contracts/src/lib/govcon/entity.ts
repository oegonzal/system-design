import type { ApiResponse } from '../envelope';

/** A firm's unique entity id, as SAM.gov issues one: twelve capital letters and digits. Every layer that reads a UEI checks it against this. */
export const UEI_SHAPE = /^[A-Z0-9]{12}$/;

/** A NAICS code an entity registered, and whether SBA sizes it small there. */
export interface EntityNaics {
  code: string;
  small: boolean | null;
}

/**
 * A SAM.gov registrant as stored: Entity Management's registration, core
 * data and assertions reduced to what a bidder asks — is it registered,
 * until when, what it claims, and whether it is excluded (the registration
 * carries that flag, so no separate exclusions request is ever spent).
 */
export interface Entity {
  uei: string;
  cage: string | null;
  legalName: string;
  registrationStatus: string | null;
  /** ISO date. */
  registrationExpiresAt: string | null;
  /** SAM.gov's business type codes, e.g. `2X` for-profit, `XS` small business. */
  businessTypes: string[];
  /** SBA certification codes, e.g. `A6` 8(a). */
  sbaCertifications: string[];
  naics: EntityNaics[];
  psc: string[];
  excluded: boolean;
  /** ISO 8601. */
  fetchedAt: string;
}

/** `POST /entities/lookup`: up to `MAX_UEI_BATCH` UEIs spend one request. */
export interface LookupEntitiesRequest {
  ueis: string[];
}

/** What a lookup came back with: the entities the registry knows, and the UEIs it does not. */
export interface EntityLookup {
  entities: Entity[];
  unknown: string[];
  spent: number | null;
  budget: number;
}

export type GetEntityResponse = ApiResponse<Entity | null>;
export type LookupEntitiesResponse = ApiResponse<EntityLookup>;
