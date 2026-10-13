import {
  AWARD_FAMILIES,
  type AwardFamily,
  type AwardFamilyChoice,
  type AwardPlacement,
} from '@sysdesign/contracts';

/**
 * An award family as USAspending's `award_type_codes` spell it. Contracts are
 * definitive contracts, purchase orders, delivery orders and BPA calls
 * (`A`–`D`); IDVs are every indefinite-delivery vehicle kind. Declared once,
 * read by every adapter that filters awards.
 */
export const AWARD_TYPE_CODES: Record<AwardFamily, readonly string[]> = {
  contracts: ['A', 'B', 'C', 'D'],
  idvs: ['IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E'],
};

/**
 * How a contract was placed, as the same codes spell it: a purchase order
 * (`B`) and a definitive contract (`D`) stand alone; a BPA call (`A`) and a
 * delivery or task order (`C`) are placed under a vehicle.
 */
export const PLACEMENT_TYPE_CODES: Record<AwardPlacement, readonly string[]> = {
  standalone: ['B', 'D'],
  order: ['A', 'C'],
};

export const awardTypeCodesOf = (choice: AwardFamilyChoice): string[] =>
  choice === 'both'
    ? AWARD_FAMILIES.flatMap((family) => [...AWARD_TYPE_CODES[family]])
    : [...AWARD_TYPE_CODES[choice]];

/** The field that ends an award of each family — a contract's end date, an IDV's last date to order. */
export const END_DATE_FIELD: Record<AwardFamily, string> = {
  contracts: 'End Date',
  idvs: 'Last Date to Order',
};
