import { UEI_SHAPE } from './entity';
import type { ScoringPolicy } from './profile';
import { AWARD_SIZE_BANDS } from './thresholds';
import { SET_ASIDE_CODES, type AwardFamilyChoice } from './vocab';

/**
 * What narrows a spending scope beyond its codes, its agency and its award
 * family: the filters a search plan sets by hand, as declared data. A facet
 * is one key on the scope, one parameter on the wire and in a view's
 * address, and one control on the scope bar; its kind says how it is chosen
 * and how it is spelled. A new facet is one key on `SpendingFacets`, one row
 * in `SPENDING_FACETS` and one row in the source adapter's mapping — the
 * snapshot key, the address and the bar follow from those.
 */
export interface FacetChoice {
  id: string;
  label: string;
  /** What choosing it means, when the label alone does not say. */
  note?: string;
}

/** Who won, by the size the government recorded for the firm on that award. */
export const RECIPIENT_SIZES = [
  { id: 'small', label: 'Small business' },
  { id: 'other', label: 'Other than small' },
] as const satisfies readonly FacetChoice[];
export type RecipientSize = (typeof RECIPIENT_SIZES)[number]['id'];

/** How the work was placed: a contract of its own, or an order under a vehicle the firm must already hold. */
export const AWARD_PLACEMENTS = [
  { id: 'standalone', label: 'Stand-alone contract' },
  { id: 'order', label: 'Order under a vehicle' },
] as const satisfies readonly FacetChoice[];
export type AwardPlacement = (typeof AWARD_PLACEMENTS)[number]['id'];

/** An award made under no set-aside, as the award sources code it. */
export const NO_SET_ASIDE = 'NONE';

const SET_ASIDE_LABELS: Record<(typeof SET_ASIDE_CODES)[number], string> = {
  SBA: 'Small business',
  SBP: 'Small business, partial',
  '8A': '8(a), competed',
  '8AN': '8(a), sole source',
  HZC: 'HUBZone',
  HZS: 'HUBZone, sole source',
  SDVOSBC: 'Service-disabled veteran',
  SDVOSBS: 'Service-disabled veteran, sole source',
  WOSB: 'Women-owned',
  WOSBSS: 'Women-owned, sole source',
  EDWOSB: 'Economically disadvantaged women-owned',
  EDWOSBSS: 'Economically disadvantaged women-owned, sole source',
  LAS: 'Local area',
  IEE: 'Indian economic enterprise',
  ISBEE: 'Indian small business economic enterprise',
  BICiv: 'Buy Indian',
  VSA: 'Veteran-owned',
  VSS: 'Veteran-owned, sole source',
};

/** The lanes an award can be made in: no set-aside, then every set-aside code the notice vocabulary names. */
export const SET_ASIDE_LANES: readonly FacetChoice[] = [
  { id: NO_SET_ASIDE, label: 'No set-aside' },
  ...SET_ASIDE_CODES.map((id) => ({ id, label: SET_ASIDE_LABELS[id] })),
];

/** Obligated dollars, inclusive at both ends; null leaves that end open. */
export interface AmountRange {
  min: number | null;
  max: number | null;
}

export interface SpendingFacets {
  /** The firms an award went to, by UEI, sorted; none listed is any firm. In a subcontract search this is the subcontractor. */
  recipient: string[];
  recipientSize: RecipientSize | null;
  placement: AwardPlacement | null;
  /** Set-aside codes, sorted; `NONE` is no set-aside; none listed is any. */
  setAside: string[];
  amount: AmountRange | null;
  /** Count an award only when it began inside the window, never a change to an older one. */
  newOnly: boolean;
}
export type FacetId = keyof SpendingFacets;

/** A scope narrowed by nothing. */
export const NO_FACETS: SpendingFacets = {
  recipient: [],
  recipientSize: null,
  placement: null,
  setAside: [],
  amount: null,
  newOnly: false,
};

/** `15000-350000`, `-15000` (no floor), `900000.01-` (no ceiling). */
export const formatAmountRange = ({ min, max }: AmountRange): string => `${min ?? ''}-${max ?? ''}`;

const RANGE_SHAPE = /^(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/;

/** A spelled range back as its bounds; null when it is not one, names no bound, or its floor is above its ceiling. */
export function parseAmountRange(text: string): AmountRange | null {
  const match = RANGE_SHAPE.exec(text.trim());
  if (match === null) return null;
  const min = match[1] === undefined ? null : Number(match[1]);
  const max = match[2] === undefined ? null : Number(match[2]);
  if (min === null && max === null) return null;
  return min !== null && max !== null && min > max ? null : { min, max };
}

/** `b, a, b` → `['a', 'b']`: the codes a list names, deduplicated and sorted, so one set has one spelling. */
export const facetCodesOf = (codes: readonly string[]): string[] =>
  [...new Set(codes.map((code) => code.trim()).filter((code) => code.length > 0))].sort();

/**
 * One facet: its label, how it is chosen, and its one spelling as a
 * parameter. `spell` answers undefined for a facet that is not set, so an
 * unset facet travels as nothing; `read` answers the unset value for a
 * parameter that is absent or not understood, since an address may say
 * anything.
 */
export type Facet<V> = {
  label: string;
  read(raw: string | null): V;
  spell(value: V): string | undefined;
} & (
  | { kind: 'choice'; choices: readonly FacetChoice[] }
  | { kind: 'codes'; choices: readonly FacetChoice[] }
  | { kind: 'entry'; hint: string }
  | { kind: 'range'; choices: readonly (FacetChoice & AmountRange)[] }
  | { kind: 'flag' }
);

/** One of a closed list, or none. */
const choice = <T extends string>(
  label: string,
  choices: readonly (FacetChoice & { id: T })[],
): Facet<T | null> => ({
  kind: 'choice',
  label,
  choices,
  read: (raw) => choices.find((option) => option.id === raw)?.id ?? null,
  spell: (value) => value ?? undefined,
});

/** Any number of codes: the choices are the ones offered, and a parameter may name others. */
const codes = (label: string, choices: readonly FacetChoice[]): Facet<string[]> => ({
  kind: 'codes',
  label,
  choices,
  read: (raw) => (raw === null ? [] : facetCodesOf(raw.split(','))),
  spell: (value) => (value.length > 0 ? value.join(',') : undefined),
});

/** Codes that are typed, not chosen: no list of them could be offered. Anything not of the shape is dropped. */
const entry = (label: string, hint: string, shape: RegExp): Facet<string[]> => ({
  kind: 'entry',
  label,
  hint,
  read: (raw) =>
    raw === null
      ? []
      : facetCodesOf(raw.split(',').map((code) => code.toUpperCase())).filter((code) =>
          shape.test(code),
        ),
  spell: (value) => (value.length > 0 ? value.join(',') : undefined),
});

/** A dollar range: the choices are the bands offered, and a parameter may name any range. */
const range = (
  label: string,
  choices: readonly (FacetChoice & AmountRange)[],
): Facet<AmountRange | null> => ({
  kind: 'range',
  label,
  choices,
  read: (raw) => (raw === null ? null : parseAmountRange(raw)),
  spell: (value) => (value === null ? undefined : formatAmountRange(value)),
});

const flag = (label: string): Facet<boolean> => ({
  kind: 'flag',
  label,
  read: (raw) => raw === 'true',
  spell: (value) => (value ? 'true' : undefined),
});

/** Every facet, in the order the scope bar shows them. */
export const SPENDING_FACETS: { [K in FacetId]: Facet<SpendingFacets[K]> } = {
  recipient: entry('Awarded to', 'UEIs, comma-separated', UEI_SHAPE),
  recipientSize: choice('Won by', RECIPIENT_SIZES),
  placement: choice('Placed as', AWARD_PLACEMENTS),
  setAside: codes('Set-aside', SET_ASIDE_LANES),
  amount: range('Award size', AWARD_SIZE_BANDS),
  newOnly: flag('New awards only'),
};

export const FACET_IDS = Object.keys(SPENDING_FACETS) as FacetId[];

/** The facets as parameters — wire and address alike: only those set, each spelled one way. */
export function facetParams(facets: SpendingFacets): Partial<Record<FacetId, string>> {
  const spelled = <K extends FacetId>(id: K): string | undefined =>
    SPENDING_FACETS[id].spell(facets[id]);
  const params: Partial<Record<FacetId, string>> = {};
  for (const id of FACET_IDS) {
    const value = spelled(id);
    if (value !== undefined) params[id] = value;
  }
  return params;
}

/** The facets a set of parameters names. */
export function facetsFromParams(read: (id: FacetId) => string | null): SpendingFacets {
  const one = <K extends FacetId>(id: K): SpendingFacets[K] => SPENDING_FACETS[id].read(read(id));
  return {
    recipient: one('recipient'),
    recipientSize: one('recipientSize'),
    placement: one('placement'),
    setAside: one('setAside'),
    amount: one('amount'),
    newOnly: one('newOnly'),
  };
}

/** The facets with one of them set from its spelling, or unset by null — how a control writes its choice. */
export function withFacet(facets: SpendingFacets, id: FacetId, raw: string | null): SpendingFacets {
  const params = facetParams(facets);
  return facetsFromParams((key) => (key === id ? raw : (params[key] ?? null)));
}

/** The facets as a query carries them: each one set is present, the rest are absent. */
export type FacetQuery = { [K in FacetId]?: NonNullable<SpendingFacets[K]> };

/** A query's facets with every one not named unset, and its codes in their one spelling. */
export const facetsOfQuery = (query: FacetQuery): SpendingFacets => ({
  recipient: facetCodesOf(query.recipient ?? NO_FACETS.recipient),
  recipientSize: query.recipientSize ?? NO_FACETS.recipientSize,
  placement: query.placement ?? NO_FACETS.placement,
  setAside: facetCodesOf(query.setAside ?? NO_FACETS.setAside),
  amount: query.amount ?? NO_FACETS.amount,
  newOnly: query.newOnly ?? NO_FACETS.newOnly,
});

/** The facets as a query names them: those set, and nothing for the rest. */
export const facetQueryOf = (facets: SpendingFacets): FacetQuery => ({
  ...(facets.recipient.length === 0 ? {} : { recipient: facets.recipient }),
  ...(facets.recipientSize === null ? {} : { recipientSize: facets.recipientSize }),
  ...(facets.placement === null ? {} : { placement: facets.placement }),
  ...(facets.setAside.length === 0 ? {} : { setAside: facets.setAside }),
  ...(facets.amount === null ? {} : { amount: facets.amount }),
  ...(facets.newOnly ? { newOnly: true } : {}),
});

/** A query as its parameters: its facets each spelled the one way, every other key as it was. */
export function withFacetParams<Q extends FacetQuery>(
  query: Q,
): Omit<Q, FacetId> & Partial<Record<FacetId, string>> {
  const rest = Object.fromEntries(
    Object.entries(query).filter(([key]) => !FACET_IDS.some((id) => id === key)),
  ) as Omit<Q, FacetId>;
  return { ...rest, ...facetParams(facetsOfQuery(query)) };
}

/** Two sets of facets that spell the same parameters are the same facets. */
export const sameFacets = (a: SpendingFacets, b: SpendingFacets): boolean =>
  JSON.stringify(facetParams(a)) === JSON.stringify(facetParams(b));

/**
 * The award family a scope's facets leave it. A placement is a way a
 * contract is placed — an order or a contract of its own — so a scope that
 * names one is a scope of contracts, whatever family it asked for.
 */
export const familyUnder = (
  awardFamily: AwardFamilyChoice,
  facets: SpendingFacets,
): AwardFamilyChoice => (facets.placement === null ? awardFamily : 'contracts');

/**
 * The set-aside lanes a profile may bid in, as the facet spells them: every
 * code its scoring prices above nothing, and no set-aside when it prices
 * open competition above nothing.
 */
export const biddableSetAsides = (policy: ScoringPolicy['setAside']): string[] =>
  facetCodesOf([
    ...(policy.unrestricted > 0 ? [NO_SET_ASIDE] : []),
    ...Object.entries(policy.byCode)
      .filter(([, value]) => value > 0)
      .map(([code]) => code),
  ]);
