import { z } from 'zod';

/**
 * SAM.gov's search response, as loosely as external data deserves: unknown
 * keys pass (the provider adds fields; a new one must not break a pull), known
 * keys are typed and nullable (every field has been absent in practice), and
 * only `noticeId` is required of a record — the normalizer decides what else
 * a lead must have. Records are validated one at a time, so a malformed one is
 * rejected and counted while the rest of the page is stored.
 */
const text = z.string().nullish();
const codeName = z.looseObject({ code: text, name: text }).nullish();

export const samRecordSchema = z.looseObject({
  noticeId: z.string().min(1),
  title: text,
  solicitationNumber: text,
  fullParentPathName: text,
  fullParentPathCode: text,
  postedDate: text,
  type: text,
  baseType: text,
  archiveType: text,
  archiveDate: text,
  typeOfSetAside: text,
  typeOfSetAsideDescription: text,
  responseDeadLine: text,
  naicsCode: text,
  naicsCodes: z.array(z.string()).nullish(),
  classificationCode: text,
  active: text,
  description: text,
  organizationType: text,
  additionalInfoLink: text,
  uiLink: text,
  resourceLinks: z.array(z.string()).nullish(),
  award: z
    .looseObject({
      date: text,
      number: text,
      amount: z.union([z.number(), z.string()]).nullish(),
      awardee: z.looseObject({ name: text, ueiSAM: text }).nullish(),
    })
    .nullish(),
  pointOfContact: z
    .array(z.looseObject({ type: text, title: text, fullName: text, email: text, phone: text }))
    .nullish(),
  /** The provider spells the office zip `zipcode`; `zip` is accepted for symmetry. */
  officeAddress: z
    .looseObject({ city: text, state: text, zip: text, zipcode: text, countryCode: text })
    .nullish(),
  placeOfPerformance: z
    .looseObject({ city: codeName, state: codeName, country: codeName, zip: text })
    .nullish(),
});
export type SamRecord = z.infer<typeof samRecordSchema>;

export const samEnvelopeSchema = z.looseObject({
  totalRecords: z.number().int().nonnegative(),
  limit: z.number().int().nullish(),
  offset: z.number().int().nullish(),
  /** Records stay unknown here: each is parsed on its own by the normalizer. */
  opportunitiesData: z.array(z.unknown()).nullish(),
});
export type SamEnvelope = z.infer<typeof samEnvelopeSchema>;
