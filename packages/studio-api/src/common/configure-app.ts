import type { INestApplication } from '@nestjs/common';
import { configureCors } from '@sysdesign/nest-kit';

/** The Next dev server runs on 4200; `CORS_ORIGIN` points elsewhere. */
export const CORS_ORIGIN = {
  envVar: 'CORS_ORIGIN',
  defaultOrigin: 'http://localhost:4200',
} as const;

/**
 * Everything that turns a bare Nest app into *this* API. Called by `main.ts`
 * and the integration harness alike, so the tests boot what production
 * boots. Validation is per route — every body and query passes a zod schema
 * through `ZodValidationPipe` — so there is no global pipe to configure.
 */
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix('api');
  return configureCors(app, CORS_ORIGIN);
}
