import { resolve } from 'node:path';

import type { ChannelDefinition } from './channels/port';
import type { NotificationsSettings } from './settings';

/**
 * The service's configuration, declared once. Every variable it reads is
 * named here as data with its fallback — its own, and each chosen channel's,
 * which that channel's definition declares — and read by the one function
 * below, which refuses by name anything it cannot use. Everything else the
 * service is configured with is a file in the package's own `config/`, read
 * by `settings.ts`. Nothing else in the package reads the environment:
 * `config.spec.ts` holds it to that.
 */

/** The package itself — `dist/..` as built, `src/..` under test — whose `config/` holds the settings. */
export const PACKAGE_ROOT = resolve(__dirname, '..');

/** Every variable the service reads for itself, with the value it takes when unset. */
export const NOTIFICATIONS_ENV = {
  port: { name: 'NOTIFICATIONS_PORT', fallback: '3005' },
} as const;

export class NotificationsConfigError extends Error {
  override readonly name = 'NotificationsConfigError';
}

/** What the application is composed from. */
export interface NotificationsConfig {
  port: number;
  settings: NotificationsSettings;
  /** Each chosen channel's variables, under the keys its definition declares them by. */
  channelEnv: Readonly<Record<string, Readonly<Record<string, string | undefined>>>>;
}

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

/**
 * The one read of the environment: the port, and the variables of every
 * channel the settings choose. A port that is not one, and a chosen channel
 * missing a variable it requires, are refused here by name, before anything
 * boots.
 */
export function notificationsConfigFromEnv(
  settings: NotificationsSettings,
  definitions: readonly ChannelDefinition[],
  env: NodeJS.ProcessEnv = process.env,
): NotificationsConfig {
  const port = set(env, NOTIFICATIONS_ENV.port.name) ?? NOTIFICATIONS_ENV.port.fallback;
  if (!/^\d{1,5}$/.test(port) || Number(port) === 0 || Number(port) > 65_535) {
    throw new NotificationsConfigError(
      `${NOTIFICATIONS_ENV.port.name} must be a port number, got ${JSON.stringify(port)}`,
    );
  }
  const channelEnv: Record<string, Record<string, string | undefined>> = {};
  for (const definition of definitions) {
    if (settings.channels[definition.id] === undefined) continue;
    const values: Record<string, string | undefined> = {};
    for (const [key, variable] of Object.entries(definition.env)) {
      const value = set(env, variable.name);
      if (value === undefined && variable.required) {
        throw new NotificationsConfigError(
          `${settings.sources.channels} runs ${definition.id}, which needs ${variable.name}: set it, or choose channels "none"`,
        );
      }
      values[key] = value;
    }
    channelEnv[definition.id] = values;
  }
  return { port: Number(port), settings, channelEnv };
}
