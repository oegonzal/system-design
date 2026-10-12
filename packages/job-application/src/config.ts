import { resolve } from 'node:path';

import type { JobApplicationSettings } from './settings';

/**
 * The service's configuration, declared once. Every variable it reads is
 * named here as data with its fallback and read by the one function below,
 * which refuses by name anything it cannot use. Everything else is a file in
 * the package's own `config/`, read by `settings.ts`. Nothing else in the
 * package reads the environment: `config.spec.ts` holds it to that.
 */

/** The package itself — `dist/..` as built, `src/..` under test — whose `config/` holds the settings. */
export const PACKAGE_ROOT = resolve(__dirname, '..');

/** Every variable the service reads, with the value it takes when unset. */
export const JOB_APPLICATION_ENV = {
  port: { name: 'JOB_APPLICATION_PORT', fallback: '3006' },
  /** The bus the record is fed from. */
  notificationsUrl: { name: 'NOTIFICATIONS_URL', fallback: 'http://localhost:3005' },
} as const;

export class JobApplicationConfigError extends Error {
  override readonly name = 'JobApplicationConfigError';
}

/** What the application is composed from. */
export interface JobApplicationConfig {
  port: number;
  notificationsUrl: string;
  settings: JobApplicationSettings;
}

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

/** The one read of the environment: a port that is not one and a URL that does not parse are refused by name, before anything boots. */
export function jobApplicationConfigFromEnv(
  settings: JobApplicationSettings,
  env: NodeJS.ProcessEnv = process.env,
): JobApplicationConfig {
  const port = set(env, JOB_APPLICATION_ENV.port.name) ?? JOB_APPLICATION_ENV.port.fallback;
  if (!/^\d{1,5}$/.test(port) || Number(port) === 0 || Number(port) > 65_535) {
    throw new JobApplicationConfigError(
      `${JOB_APPLICATION_ENV.port.name} must be a port number, got ${JSON.stringify(port)}`,
    );
  }
  const notificationsUrl =
    set(env, JOB_APPLICATION_ENV.notificationsUrl.name) ??
    JOB_APPLICATION_ENV.notificationsUrl.fallback;
  try {
    new URL(notificationsUrl);
  } catch {
    throw new JobApplicationConfigError(
      `${JOB_APPLICATION_ENV.notificationsUrl.name} must be a URL, got ${JSON.stringify(notificationsUrl)}`,
    );
  }
  return { port: Number(port), notificationsUrl, settings };
}
