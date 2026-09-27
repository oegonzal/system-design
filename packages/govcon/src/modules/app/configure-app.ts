import type { INestApplication } from '@nestjs/common';

/**
 * Cross-cutting HTTP setup, shared by `main.ts` and the integration spec so
 * they boot an identically configured app. The web client runs on 4202.
 */
export function configureApp<T extends INestApplication>(
  app: T,
  env: NodeJS.ProcessEnv = process.env,
): T {
  app.enableCors({ origin: env['GOVCON_CORS_ORIGIN'] ?? 'http://localhost:4202' });
  return app;
}
