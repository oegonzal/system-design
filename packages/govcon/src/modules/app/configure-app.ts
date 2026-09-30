import type { INestApplication } from '@nestjs/common';
import { configureCors } from '@sysdesign/nest-kit';

/** The web client runs on 4202; `GOVCON_CORS_ORIGIN` points elsewhere. */
export const CORS_ORIGIN = {
  envVar: 'GOVCON_CORS_ORIGIN',
  defaultOrigin: 'http://localhost:4202',
} as const;

/** Boots `main.ts` and the integration spec identically. */
export const configureApp = <T extends INestApplication>(
  app: T,
  env: NodeJS.ProcessEnv = process.env,
): T => configureCors(app, CORS_ORIGIN, env);
