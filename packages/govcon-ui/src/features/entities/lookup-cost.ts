import { MAX_UEI_BATCH } from '@sysdesign/contracts';

/** What looking `count` registrants up costs: one SAM.gov request per batch of `MAX_UEI_BATCH` — every button that spends one reads its line from here. */
export const lookupCost = (count: number): string => {
  const batches = Math.max(1, Math.ceil(count / MAX_UEI_BATCH));
  return `${batches} request${batches === 1 ? '' : 's'} (1 per ${MAX_UEI_BATCH} UEIs)`;
};
