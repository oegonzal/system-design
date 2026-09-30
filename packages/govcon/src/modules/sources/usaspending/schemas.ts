import { z } from 'zod';

/** USAspending's award search response: the fields asked for, loosely; `page_metadata.hasNext` pages. */
const text = z.string().nullish();
const codeDescription = z.looseObject({ code: text, description: text }).nullish();

export const spendingAwardSchema = z.looseObject({
  generated_internal_id: z.string().min(1),
  'Award ID': text,
  'Recipient Name': text,
  'Recipient UEI': text,
  'Award Amount': z.union([z.number(), z.string()]).nullish(),
  'Awarding Agency': text,
  'Awarding Sub Agency': text,
  'Start Date': text,
  'End Date': text,
  NAICS: codeDescription,
  PSC: codeDescription,
  'Place of Performance State Code': text,
  'Place of Performance City Name': text,
});
export type SpendingAward = z.infer<typeof spendingAwardSchema>;

export const spendingEnvelopeSchema = z.looseObject({
  results: z.array(z.unknown()).nullish(),
  page_metadata: z.looseObject({ hasNext: z.boolean().nullish() }).nullish(),
});
