import { resolve } from 'node:path';

import type { AgenticSystemSettings } from './settings';

/**
 * The service's configuration, declared once. Every variable it reads is named
 * here with its fallback and read by the one function below, which refuses by
 * name anything it cannot use. Everything else is a file under the package's
 * own `config/`, read by `settings.ts`; `config.spec.ts` holds the package to
 * reading the environment only here.
 */

/** The package itself — `dist/..` as built, `src/..` under test — whose `config/` holds the settings. */
export const PACKAGE_ROOT = resolve(__dirname, '..');

/** Every variable the service reads, with the value it takes when unset. */
export const AGENTIC_SYSTEM_ENV = {
  port: { name: 'AGENTIC_SYSTEM_PORT', fallback: '3007' },
  /** The quality loop the coach run and the digest orchestration go to. */
  loopUrl: { name: 'QUALITY_LOOP_URL', fallback: 'http://localhost:3003' },
  /** The bus the service publishes design lifecycle events to. */
  notificationsUrl: { name: 'NOTIFICATIONS_URL', fallback: 'http://localhost:3005' },
} as const;

export class AgenticSystemConfigError extends Error {
  override readonly name = 'AgenticSystemConfigError';
}

/** What the application is composed from. */
export interface AgenticSystemConfig {
  port: number;
  loopUrl: string;
  notificationsUrl: string;
  settings: AgenticSystemSettings;
}

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

const url = (env: NodeJS.ProcessEnv, variable: { name: string; fallback: string }): string => {
  const value = set(env, variable.name) ?? variable.fallback;
  try {
    new URL(value);
  } catch {
    throw new AgenticSystemConfigError(
      `${variable.name} must be a URL, got ${JSON.stringify(value)}`,
    );
  }
  return value;
};

/** The one read of the environment: a bad port or URL is refused by name before anything boots. */
export function agenticSystemConfigFromEnv(
  settings: AgenticSystemSettings,
  env: NodeJS.ProcessEnv = process.env,
): AgenticSystemConfig {
  const port = set(env, AGENTIC_SYSTEM_ENV.port.name) ?? AGENTIC_SYSTEM_ENV.port.fallback;
  if (!/^\d{1,5}$/.test(port) || Number(port) === 0 || Number(port) > 65_535) {
    throw new AgenticSystemConfigError(
      `${AGENTIC_SYSTEM_ENV.port.name} must be a port number, got ${JSON.stringify(port)}`,
    );
  }
  return {
    port: Number(port),
    loopUrl: url(env, AGENTIC_SYSTEM_ENV.loopUrl),
    notificationsUrl: url(env, AGENTIC_SYSTEM_ENV.notificationsUrl),
    settings,
  };
}
