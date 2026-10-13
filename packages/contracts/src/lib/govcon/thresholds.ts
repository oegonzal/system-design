/**
 * The dollar lines of federal acquisition, as data with the day they took
 * effect. Read from the Federal Acquisition Regulation on acquisition.gov on
 * 2026-10-13: the micro-purchase threshold and the simplified acquisition
 * threshold of FAR 2.101, and the subcontracting-plan threshold of FAR
 * 19.702, each as raised on 2025-10-01. A purchase at or under the first
 * needs no competition; one at or under the second is reserved for small
 * business when two can be expected to offer (FAR 19.502-2); a prime that is
 * not small owes a subcontracting plan on a contract expected to exceed the
 * third. When the lines move, this table moves and nothing else does.
 */
export const ACQUISITION_THRESHOLDS = {
  effective: '2025-10-01',
  microPurchase: 15_000,
  simplifiedAcquisition: 350_000,
  subcontractingPlan: 900_000,
} as const;

/** One cent: a band begins just past the line the band before it ends on, since the source's bounds are inclusive at both ends. */
const PAST = 0.01;

/**
 * Award sizes by the lines they fall between — what a size filter offers and
 * what a count is cut by. Each band is closed at both ends and no dollar
 * amount is in two, so their counts add up to the whole.
 */
export const AWARD_SIZE_BANDS = [
  {
    id: 'micro',
    label: 'Up to $15K',
    note: 'Micro-purchase: bought without competition.',
    min: null,
    max: ACQUISITION_THRESHOLDS.microPurchase,
  },
  {
    id: 'simplified',
    label: '$15K to $350K',
    note: 'Simplified acquisition: reserved for small business when two can be expected to offer.',
    min: ACQUISITION_THRESHOLDS.microPurchase + PAST,
    max: ACQUISITION_THRESHOLDS.simplifiedAcquisition,
  },
  {
    id: 'mid',
    label: '$350K to $900K',
    note: 'Competed in full, under the line where a subcontracting plan is owed.',
    min: ACQUISITION_THRESHOLDS.simplifiedAcquisition + PAST,
    max: ACQUISITION_THRESHOLDS.subcontractingPlan,
  },
  {
    id: 'large',
    label: 'Over $900K',
    note: 'A prime that is not small owes a small-business subcontracting plan.',
    min: ACQUISITION_THRESHOLDS.subcontractingPlan + PAST,
    max: null,
  },
] as const;
export type AwardSizeBandId = (typeof AWARD_SIZE_BANDS)[number]['id'];
