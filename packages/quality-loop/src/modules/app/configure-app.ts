import type { INestApplication } from '@nestjs/common';
import { configureCors } from '@sysdesign/nest-kit';

/** The web client runs on 4201; `QUALITY_LOOP_CORS_ORIGIN` points elsewhere. */
export const CORS_ORIGIN = {
  envVar: 'QUALITY_LOOP_CORS_ORIGIN',
  defaultOrigin: 'http://localhost:4201',
} as const;

/** Boots `main.ts` and the integration specs identically. */
export const configureApp = <T extends INestApplication>(
  app: T,
  env: NodeJS.ProcessEnv = process.env,
): T => configureCors(app, CORS_ORIGIN, env);
