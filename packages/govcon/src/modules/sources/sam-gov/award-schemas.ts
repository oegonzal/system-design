import { z } from 'zod';

/**
 * SAM.gov's Contract Awards search response, as loosely as external data
 * deserves: unknown keys pass, known keys are typed and nullable, and only
 * the contract id is required of a record — the normalizer decides what
 * else an award must have. `totalRecords`, `limit` and `offset` arrive as
 * strings.
 */
const text = z.string().nullish();
const number = z.union([z.number(), z.string()]).nullish();
const codeName = z.looseObject({ code: text, name: text }).nullish();

export const samAwardSchema = z.looseObject({
  contractId: z.looseObject({
    piid: z.string().min(1),
    modificationNumber: text,
    transactionNumber: text,
  }),
  coreData: z
    .looseObject({
      solicitationId: text,
      awardOrIDVType: codeName,
      federalOrganization: z
        .looseObject({
          contractingInformation: z
            .looseObject({
              contractingDepartment: codeName,
              contractingSubtier: codeName,
              contractingOffice: codeName,
            })
            .nullish(),
        })
        .nullish(),
      principalPlaceOfPerformance: z
        .looseObject({
          city: z.looseObject({ name: text }).nullish(),
          state: codeName,
          zipCode: text,
          country: codeName,
        })
        .nullish(),
      productOrServiceInformation: z
        .looseObject({
          productOrService: codeName,
          principalNaics: z.array(z.looseObject({ code: text, name: text })).nullish(),
        })
        .nullish(),
      competitionInformation: z
        .looseObject({ extentCompeted: codeName, typeOfSetAside: codeName })
        .nullish(),
    })
    .nullish(),
  awardDetails: z
    .looseObject({
      dates: z
        .looseObject({
          dateSigned: text,
          periodOfPerformanceStartDate: text,
          ultimateCompletionDate: text,
          currentCompletionDate: text,
        })
        .nullish(),
      dollars: z.looseObject({ actionObligation: number }).nullish(),
      competitionInformation: z.looseObject({ numberOfOffersReceived: number }).nullish(),
      awardeeData: z
        .looseObject({
          awardeeHeader: z.looseObject({ awardeeName: text, legalBusinessName: text }).nullish(),
          awardeeUEIInformation: z.looseObject({ uniqueEntityId: text }).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
export type SamAward = z.infer<typeof samAwardSchema>;

export const samAwardsEnvelopeSchema = z.looseObject({
  totalRecords: number,
  awardSummary: z.array(z.unknown()).nullish(),
});
