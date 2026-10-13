import {
  MAX_VIEW_HREF_LENGTH,
  MAX_VIEW_NAME_LENGTH,
  type SaveSavedViewRequest,
} from '@sysdesign/contracts';
import { z } from 'zod';

/**
 * A path inside the client with its query: one leading `/`, no second one
 * and no backslash, so it can never be read as another site's address, and
 * no whitespace or control character.
 */
const clientPath = z
  .string()
  .max(MAX_VIEW_HREF_LENGTH)
  .regex(/^\/(?![/\\])[^\s\\]*$/, 'an address inside the client: a path beginning with one /');

/** The body of `PUT /profiles/:id/views`. */
export const saveViewSchema = z.strictObject({
  name: z.string().trim().min(1).max(MAX_VIEW_NAME_LENGTH),
  href: clientPath,
}) satisfies z.ZodType<SaveSavedViewRequest>;
export type SaveViewBody = z.output<typeof saveViewSchema>;
