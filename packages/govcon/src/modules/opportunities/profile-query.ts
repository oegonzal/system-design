import { z } from 'zod';

/** `?profile=` on the routes that score: the default profile unless told otherwise. */
export const profileQuerySchema = z.strictObject({
  profile: z.string().min(1).optional(),
});
export type ProfileQuery = z.output<typeof profileQuerySchema>;
