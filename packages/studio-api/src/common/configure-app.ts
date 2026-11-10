import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureBodyLimit, configureCors } from '@sysdesign/nest-kit';

/** The Next dev server runs on 4200; `CORS_ORIGIN` points elsewhere. */
export const CORS_ORIGIN = {
  envVar: 'CORS_ORIGIN',
  defaultOrigin: 'http://localhost:4200',
} as const;

/**
 * Everything that turns a bare Nest app into *this* API. Called by `main.ts`
 * and the integration harness alike, so the tests boot what production
 * boots. Validation is per route — every body and query passes a zod schema
 * through `ZodValidationPipe` — so there is no global pipe to configure. The
 * JSON body limit is nest-kit's declared one, shared with the loop.
 */
export function configureApp<T extends NestExpressApplication>(app: T): T {
  app.setGlobalPrefix('api');
  return configureCors(configureBodyLimit(app), CORS_ORIGIN);
}
