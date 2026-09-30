import { z } from 'zod';

/**
 * Entity Management's response for `includeSections=entityRegistration,coreData,assertions`,
 * as loosely as external data deserves: only the UEI is required; the
 * normalizer decides what else a registrant must have.
 */
const text = z.string().nullish();

export const samEntitySchema = z.looseObject({
  entityRegistration: z.looseObject({
    ueiSAM: z.string().min(1),
    cageCode: text,
    legalBusinessName: text,
    dbaName: text,
    registrationStatus: text,
    registrationExpirationDate: text,
    exclusionStatusFlag: text,
  }),
  coreData: z
    .looseObject({
      businessTypes: z
        .looseObject({
          businessTypeList: z.array(z.looseObject({ businessTypeCode: text })).nullish(),
          sbaBusinessTypeList: z.array(z.looseObject({ sbaBusinessTypeCode: text })).nullish(),
        })
        .nullish(),
    })
    .nullish(),
  assertions: z
    .looseObject({
      goodsAndServices: z
        .looseObject({
          naicsList: z.array(z.looseObject({ naicsCode: text, sbaSmallBusiness: text })).nullish(),
          pscList: z.array(z.looseObject({ pscCode: text })).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
export type SamEntity = z.infer<typeof samEntitySchema>;

export const samEntitiesEnvelopeSchema = z.looseObject({
  totalRecords: z.union([z.number(), z.string()]).nullish(),
  entityData: z.array(z.unknown()).nullish(),
});
