import type { INestApplication } from '@nestjs/common';

/** Where an app's web client is served from: the env override and its dev default. */
export interface CorsOrigin {
  envVar: string;
  defaultOrigin: string;
}

/**
 * Cross-cutting HTTP setup shared by an app's `main.ts` and its integration
 * specs, so both boot an identically configured app. The app declares its
 * origin as data; the env var wins when set.
 */
export function configureCors<T extends INestApplication>(
  app: T,
  origin: CorsOrigin,
  env: NodeJS.ProcessEnv = process.env,
): T {
  app.enableCors({ origin: env[origin.envVar] ?? origin.defaultOrigin });
  return app;
}
