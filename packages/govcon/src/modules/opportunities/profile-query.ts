import { z } from 'zod';

import { DEFAULT_PROFILE_ID } from '../../profiles';

/** `?profile=` on the routes that score: the shipped profile unless told otherwise. */
export const profileQuerySchema = z.strictObject({
  profile: z.string().min(1).default(DEFAULT_PROFILE_ID),
});
export type ProfileQuery = z.output<typeof profileQuerySchema>;
