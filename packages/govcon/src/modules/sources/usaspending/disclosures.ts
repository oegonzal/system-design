/**
 * Provider facts about USAspending's data, declared once and carried on every
 * answer that rests on them, so a reader learns them from the answer instead
 * of a client knowing them. Each adapter declares the lists that apply to it.
 */
export const USASPENDING_DISCLOSURES = {
  awards: [
    'USAspending loads award data nightly from the federal procurement system; Department of Defense awards are published 90 days after they are signed.',
  ],
  financials: [
    'Agency budgetary resources and obligations arrive by submission period and are revealed weeks after the period ends.',
  ],
  horizon: [
    'USAspending cannot filter by period of performance and its keyset cursor is not usable: awards are walked newest-ending first by numbered page within the lookback window, so a wide scope may be capped before it reaches today.',
    'An indefinite-delivery vehicle’s amount is what has been obligated on it so far, often zero — its count is the signal.',
  ],
} as const;
