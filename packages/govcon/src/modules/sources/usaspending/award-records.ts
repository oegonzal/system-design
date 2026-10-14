import type {
  AwardDetailRequest,
  AwardFamily,
  AwardOrders,
  AwardSubawardsRequest,
  AwardSubcontract,
  FirmRef,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { dottedPath } from '../../../core/agency-path';
import type { Attempted, Fetched } from '../../../core/budget';
import type { AwardRecord, AwardRecords } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { offersCounted } from '../offers';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { amount, clean, day, integer } from './values';

const awardPath = (externalId: string): string =>
  `/api/v2/awards/${encodeURIComponent(externalId)}/`;
const ordersPath = (externalId: string): string =>
  `/api/v2/idvs/amounts/${encodeURIComponent(externalId)}/`;
const SUBAWARDS_PATH = '/api/v2/subawards/';

/** The source's award categories this package reads, as its own families. */
const FAMILY_OF: Record<string, AwardFamily> = { contract: 'contracts', idv: 'idvs' };

const text = z.string().nullish();
const number = z.union([z.number(), z.string()]).nullish();
const agencySchema = z
  .looseObject({
    toptier_agency: z.looseObject({ name: text, code: text }).nullish(),
    subtier_agency: z.looseObject({ name: text, code: text }).nullish(),
    office_agency_name: text,
  })
  .nullish();

const awardSchema = z.looseObject({
  generated_unique_award_id: z.string().min(1),
  piid: text,
  category: text,
  type_description: text,
  description: text,
  total_obligation: number,
  base_exercised_options: number,
  base_and_all_options: number,
  subaward_count: number,
  total_subaward_amount: number,
  date_signed: text,
  parent_award: z
    .looseObject({
      generated_unique_award_id: text,
      piid: text,
      idv_type_description: text,
      agency_name: text,
      multiple_or_single_aw_desc: text,
    })
    .nullish(),
  latest_transaction_contract_data: z
    .looseObject({
      number_of_offers_received: number,
      type_set_aside: text,
      type_set_aside_description: text,
      extent_competed_description: text,
      solicitation_procedures_description: text,
      type_of_contract_pricing_description: text,
      solicitation_identifier: text,
      multiple_or_single_award_description: text,
      naics: text,
      naics_description: text,
      product_or_service_code: text,
      product_or_service_description: text,
    })
    .nullish(),
  awarding_agency: agencySchema,
  period_of_performance: z
    .looseObject({ start_date: text, end_date: text, potential_end_date: text })
    .nullish(),
  recipient: z
    .looseObject({
      recipient_name: text,
      recipient_uei: text,
      parent_recipient_name: text,
      parent_recipient_uei: text,
    })
    .nullish(),
  place_of_performance: z.looseObject({ city_name: text, state_code: text }).nullish(),
});

/** A vehicle's orders: those placed under it, and those placed under the vehicles awarded under it. */
const ordersSchema = z.looseObject({
  child_idv_count: number,
  child_award_count: number,
  child_award_total_obligation: number,
  grandchild_award_count: number,
  grandchild_award_total_obligation: number,
});

const subawardSchema = z.looseObject({
  id: z.union([z.number(), z.string()]),
  recipient_name: text,
  amount: z.union([z.number(), z.string()]),
  action_date: text,
  description: text,
});
const subawardsEnvelopeSchema = z.looseObject({ results: z.array(z.unknown()) });

/** A firm named by neither name nor UEI. */
const UNNAMED = '(unnamed)';

const firmOf = (name: string | null | undefined, uei: string | null | undefined): FirmRef => ({
  uei: clean(uei),
  name: clean(name) ?? UNNAMED,
});

/** `CITY, ST`, or whichever of the two the source gave. */
const placeOf = (city: string | null, state: string | null): string | null =>
  city !== null && state !== null ? `${city}, ${state}` : (city ?? state);

/**
 * One award as the source keeps it → the record a page reads. Null when it
 * is not readable or is neither a contract nor a vehicle. Pure.
 */
export function normalizeAwardRecord(raw: unknown): AwardRecord | null {
  const parsed = awardSchema.safeParse(raw);
  if (!parsed.success) return null;
  const award = parsed.data;
  const family = FAMILY_OF[clean(award.category) ?? ''];
  if (family === undefined) return null;
  const terms = award.latest_transaction_contract_data;
  const period = award.period_of_performance;
  const buyer = award.awarding_agency;
  const vehicle = award.parent_award;
  const holder = firmOf(award.recipient?.recipient_name, award.recipient?.recipient_uei);
  const owner = firmOf(
    award.recipient?.parent_recipient_name,
    award.recipient?.parent_recipient_uei,
  );
  // The source names a firm with no owner as its own parent; that is no parent.
  const owned =
    clean(award.recipient?.parent_recipient_name) !== null &&
    (owner.uei === null ? owner.name !== holder.name : owner.uei !== holder.uei);
  return {
    externalId: award.generated_unique_award_id,
    piid: clean(award.piid),
    family,
    typeDescription: clean(award.type_description),
    description: clean(award.description),
    recipient: holder,
    parent: owned ? owner : null,
    agencyPath: dottedPath([
      clean(buyer?.toptier_agency?.name),
      clean(buyer?.subtier_agency?.name),
      clean(buyer?.office_agency_name),
    ]),
    agencyCode: dottedPath([
      clean(buyer?.toptier_agency?.code),
      clean(buyer?.subtier_agency?.code),
    ]),
    vehicle:
      vehicle === null || vehicle === undefined
        ? null
        : {
            externalId: clean(vehicle.generated_unique_award_id),
            piid: clean(vehicle.piid),
            kind: clean(vehicle.idv_type_description),
            agency: clean(vehicle.agency_name),
            holders: clean(vehicle.multiple_or_single_aw_desc),
          },
    holders: clean(terms?.multiple_or_single_award_description),
    obligated: amount(award.total_obligation) ?? 0,
    exercised: amount(award.base_exercised_options),
    ceiling: amount(award.base_and_all_options),
    signedAt: day(award.date_signed),
    startsAt: day(period?.start_date),
    endsAt: day(period?.end_date),
    endsWithOptionsAt: day(period?.potential_end_date),
    naicsCode: clean(terms?.naics),
    naicsDescription: clean(terms?.naics_description),
    pscCode: clean(terms?.product_or_service_code),
    pscDescription: clean(terms?.product_or_service_description),
    placeOfPerformance: placeOf(
      clean(award.place_of_performance?.city_name),
      clean(award.place_of_performance?.state_code),
    ),
    competition: {
      offers: offersCounted(integer(terms?.number_of_offers_received)),
      setAsideCode: clean(terms?.type_set_aside),
      setAside: clean(terms?.type_set_aside_description),
      extentCompeted: clean(terms?.extent_competed_description),
      solicitationProcedures: clean(terms?.solicitation_procedures_description),
      pricing: clean(terms?.type_of_contract_pricing_description),
      solicitationId: clean(terms?.solicitation_identifier),
    },
    subcontractCount: Math.max(0, integer(award.subaward_count) ?? 0),
    subcontractAmount: amount(award.total_subaward_amount) ?? 0,
  };
}

/**
 * What was ordered under a vehicle, or null when the answer is not
 * readable. A schedule's orders are often placed under an agreement awarded
 * under it, so both levels are one count and one total. Pure.
 */
export function normalizeAwardOrders(raw: unknown): AwardOrders | null {
  const parsed = ordersSchema.safeParse(raw);
  if (!parsed.success) return null;
  const orders = parsed.data;
  const whole = (value: typeof orders.child_award_count): number =>
    Math.max(0, integer(value) ?? 0);
  return {
    count: whole(orders.child_award_count) + whole(orders.grandchild_award_count),
    obligated:
      (amount(orders.child_award_total_obligation) ?? 0) +
      (amount(orders.grandchild_award_total_obligation) ?? 0),
    vehicles: whole(orders.child_idv_count),
  };
}

/** One subcontract of an award, or null without its id or a readable amount. Pure. */
export function normalizeAwardSubcontract(raw: unknown): AwardSubcontract | null {
  const parsed = subawardSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = amount(parsed.data.amount);
  if (value === null) return null;
  return {
    id: String(parsed.data.id),
    name: clean(parsed.data.recipient_name),
    amount: value,
    actionDate: day(parsed.data.action_date),
    description: clean(parsed.data.description),
  };
}

/**
 * One award's own record (`awards/{id}`), what was ordered under it when it
 * is a vehicle (`idvs/amounts/{id}`) and the largest subcontracts reported
 * under it (`subawards`), each one request. An id the source does not have
 * answers 404 there and null here.
 */
export class UsaSpendingAwardRecords implements AwardRecords {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = [
    ...USASPENDING_DISCLOSURES.awards,
    ...USASPENDING_DISCLOSURES.subcontracts,
  ];

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async detail(request: AwardDetailRequest): Promise<Attempted<Fetched<AwardRecord | null>>> {
    const { attempts, result } = await this.http.json(
      `${this.baseUrl}${awardPath(request.externalId)}`,
      new URLSearchParams(),
    );
    const none = { kind: 'ok' as const, value: null, recordCount: 0, totalRecords: null };
    if (result.kind !== 'ok') {
      return { attempts, result: result.status === 404 ? none : result };
    }
    const record = normalizeAwardRecord(result.body);
    if (record === null) this.warn(`usaspending: award ${request.externalId} did not normalize`);
    return {
      attempts,
      result:
        record === null ? none : { kind: 'ok', value: record, recordCount: 1, totalRecords: null },
    };
  }

  async orders(request: AwardDetailRequest): Promise<Attempted<Fetched<AwardOrders>>> {
    const { attempts, result } = await this.http.json(
      `${this.baseUrl}${ordersPath(request.externalId)}`,
      new URLSearchParams(),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const orders = normalizeAwardOrders(result.body);
    return {
      attempts,
      result:
        orders === null
          ? this.http.invalid(`orders under ${request.externalId} are not readable`)
          : { kind: 'ok', value: orders, recordCount: orders.count, totalRecords: null },
    };
  }

  async subcontracts(
    request: AwardSubawardsRequest,
  ): Promise<Attempted<Fetched<AwardSubcontract[]>>> {
    const { attempts, result } = await this.http.postJson(`${this.baseUrl}${SUBAWARDS_PATH}`, {
      award_id: request.externalId,
      limit: request.limit,
      page: 1,
      sort: 'amount',
      order: 'desc',
    });
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = subawardsEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const rows = parsed.data.results.flatMap((raw) => {
      const row = normalizeAwardSubcontract(raw);
      return row === null ? [] : [row];
    });
    return {
      attempts,
      result: {
        kind: 'ok',
        value: rows,
        recordCount: parsed.data.results.length,
        totalRecords: null,
      },
    };
  }
}
