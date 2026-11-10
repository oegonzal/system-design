import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * The largest JSON body an app parses. Express's default is 100 KB, and a
 * grade request passes it: measured 2026-11-10, a 94 KB canvas with its 42 KB
 * goal and 9 KB rubric was refused 413 by the loop, and so by the studio that
 * forwarded it, while the contracts' bounds admit a canvas several times that
 * size. One megabyte holds every declared bound with room; what a schema
 * refuses, it refuses after parsing and by name.
 */
export const JSON_BODY_LIMIT = '1mb';

/**
 * Registers the JSON parser with the declared limit. It runs ahead of the
 * default parser Nest registers at init, which then finds the body parsed and
 * skips — so the limit must be configured before the app listens, as
 * `configureApp` is.
 */
export function configureBodyLimit<T extends NestExpressApplication>(
  app: T,
  limit: string = JSON_BODY_LIMIT,
): T {
  app.useBodyParser('json', { limit });
  return app;
}
