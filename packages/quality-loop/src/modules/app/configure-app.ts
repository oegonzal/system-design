import type { INestApplication } from '@nestjs/common';

/**
 * Cross-cutting HTTP setup, shared by `main.ts` and the integration specs so
 * they boot an identically configured app. The web client runs on 4201.
 */
export function configureApp<T extends INestApplication>(
  app: T,
  env: NodeJS.ProcessEnv = process.env,
): T {
  app.enableCors({ origin: env['QUALITY_LOOP_CORS_ORIGIN'] ?? 'http://localhost:4201' });
  return app;
}
