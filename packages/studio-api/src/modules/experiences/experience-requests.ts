import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** Paged like every list: the bounds are validated and the meta reports what was applied. */
export const listExperiencesQuerySchema = z.strictObject(
  pageFields(MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT),
);
export type ListExperiencesQueryInput = z.infer<typeof listExperiencesQuerySchema>;
