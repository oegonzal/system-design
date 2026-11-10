import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureBodyLimit, configureCors } from '@sysdesign/nest-kit';

/** The web client runs on 4201; `QUALITY_LOOP_CORS_ORIGIN` points elsewhere. */
export const CORS_ORIGIN = {
  envVar: 'QUALITY_LOOP_CORS_ORIGIN',
  defaultOrigin: 'http://localhost:4201',
} as const;

/** Boots `main.ts` and the integration specs identically: the CORS origin and the JSON body limit. */
export const configureApp = <T extends NestExpressApplication>(
  app: T,
  env: NodeJS.ProcessEnv = process.env,
): T => configureCors(configureBodyLimit(app), CORS_ORIGIN, env);
