import { NotFoundException } from '@nestjs/common';
import type { StudioNotFoundResponse, StudioResource } from '@sysdesign/contracts';

/**
 * The one 404 this API raises: the framework's shape plus `missing`, the kind
 * of thing the address did not find. A client reading a session, a revision
 * and its grade side by side gets the same answer from each when the session
 * is gone, and can tell that from a grade that is merely not there.
 */
export const notFound = (missing: StudioResource, message: string): NotFoundException =>
  new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    message,
    missing,
  } satisfies StudioNotFoundResponse);
