import type { ApiResponse } from '../envelope';
import type { FirmRef } from './primes';
import type { NoticeRef, Provenance } from './spending';
import type { AwardFamily } from './vocab';

// Award — one award's own record.

/** An award's id as the source mints it: one path segment, no whitespace. */
export const AWARD_ID_SHAPE = /^[^\s/]{1,200}$/;

/** The vehicle an order was placed under. */
export interface AwardVehicle {
  externalId: string | null;
  piid: string | null;
  /** The kind of vehicle, as the source names it: `BPA`, `FSS`, `GWAC`. */
  kind: string | null;
  agency: string | null;
  /** Whether one firm or several hold it, as the source words it. */
  holders: string | null;
}

export interface AwardCompetition {
  /** Offers received; null when the buyer did not count them. */
  offers: number | null;
  setAsideCode: string | null;
  setAside: string | null;
  extentCompeted: string | null;
  solicitationProcedures: string | null;
  pricing: string | null;
  solicitationId: string | null;
}

/** What was ordered under a vehicle. */
export interface AwardOrders {
  /** Orders placed under it, directly or through a vehicle awarded under it. */
  count: number;
  /** What those orders have obligated. */
  obligated: number;
  /** Vehicles awarded under it, whose orders are counted above. */
  vehicles: number;
}

export interface AwardSubcontract {
  /** The source's own id for the subcontract. */
  id: string;
  name: string | null;
  amount: number;
  /** ISO date. */
  actionDate: string | null;
  description: string | null;
}

/** What the award lens computes and the snapshot stores. */
export interface AwardBody {
  externalId: string;
  piid: string | null;
  family: AwardFamily;
  typeDescription: string | null;
  description: string | null;
  recipient: FirmRef;
  /** The firm that owns the recipient, when the source names one. */
  parent: FirmRef | null;
  /** Dotted `department.subtier.office`, as a notice's is. */
  agencyPath: string | null;
  /** `toptier.subtier` codes. */
  agencyCode: string | null;
  /** Null for an award placed on its own. */
  vehicle: AwardVehicle | null;
  /** Whether one firm or several hold it, as the source words it; said of a vehicle only. */
  holders: string | null;
  /** What was ordered under it; null for an award that is not a vehicle. */
  orders: AwardOrders | null;
  /** Obligated on the award itself so far — a vehicle carries its money on its orders. */
  obligated: number;
  /** The base and the options exercised so far. */
  exercised: number | null;
  /** The base and every option: what the award can reach. */
  ceiling: number | null;
  /** ISO dates. */
  signedAt: string | null;
  startsAt: string | null;
  /** The end of the period already exercised. */
  endsAt: string | null;
  /** The end if every option is exercised; null when the source gives none. */
  endsWithOptionsAt: string | null;
  naicsCode: string | null;
  naicsDescription: string | null;
  pscCode: string | null;
  pscDescription: string | null;
  placeOfPerformance: string | null;
  competition: AwardCompetition;
  /** Subcontracts reported under it, by the source's own count and total. */
  subcontractCount: number;
  subcontractAmount: number;
  /** The largest of them, bounded. */
  subcontracts: AwardSubcontract[];
}

/**
 * The wire answer: the body, the open stored notices sharing its NAICS and
 * buyer joined on every read — never stored — and the provenance.
 */
export interface AwardDetail extends AwardBody {
  openNotices: NoticeRef[];
  provenance: Provenance;
}

export type GetAwardDetailResponse = ApiResponse<AwardDetail>;
