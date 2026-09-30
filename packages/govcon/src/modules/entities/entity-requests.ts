import { MAX_UEI_BATCH, type LookupEntitiesRequest } from '@sysdesign/contracts';
import { z } from 'zod';

export const ueiSchema = z.string().regex(/^[A-Z0-9]{12}$/, 'a UEI is twelve letters and digits');

/** The body of `POST /entities/lookup`: at most one batch per request. */
export const lookupEntitiesRequestSchema = z.strictObject({
  ueis: z.array(ueiSchema).min(1).max(MAX_UEI_BATCH),
}) satisfies z.ZodType<LookupEntitiesRequest>;
export type LookupEntitiesBody = z.output<typeof lookupEntitiesRequestSchema>;

export const ueiParamSchema = z.strictObject({ uei: ueiSchema });
export const ownQuerySchema = z.strictObject({ profile: z.string().min(1).optional() });
export type OwnQuery = z.output<typeof ownQuerySchema>;
