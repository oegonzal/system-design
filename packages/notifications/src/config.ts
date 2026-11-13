import { resolve } from 'node:path';

import type { InstanceSettings } from './channels';
import type { ChannelDefinition } from './channels/port';
import type { NotificationsSettings, SettingsChoices } from './settings';

/**
 * The service's configuration, declared once. Every variable it reads is
 * named as data — its own here with its fallback, and each channel
 * instance's in the chosen channels file, bound to the keys its kind
 * declares — and read by the one function below, which refuses by name
 * anything it cannot use. Everything else the service is configured with is a
 * file in the package's own `config/`, read by `settings.ts` with the one
 * choice the environment may make: which channels file runs, so a deployment
 * carrying one bot runs a file of its own without editing the checked-in
 * choices. Nothing else in the package reads the environment:
 * `config.spec.ts` holds it to that.
 */

/** The package itself — `dist/..` as built, `src/..` under test — whose `config/` holds the settings. */
export const PACKAGE_ROOT = resolve(__dirname, '..');

/** Every variable the service reads for itself, with the value it takes when unset. */
export const NOTIFICATIONS_ENV = {
  port: { name: 'NOTIFICATIONS_PORT', fallback: '3005' },
  /** The channels file to run, by name; unset, `config/engine.json`'s choice stands. */
  channels: { name: 'NOTIFICATIONS_CHANNELS', fallback: undefined },
} as const;

export class NotificationsConfigError extends Error {
  override readonly name = 'NotificationsConfigError';
}

/** What the application is composed from. */
export interface NotificationsConfig {
  port: number;
  settings: NotificationsSettings;
  /** Each running instance's variables, by its id, under the keys its kind declares. */
  channelEnv: Readonly<Record<string, Readonly<Record<string, string | undefined>>>>;
}

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

type Instances = readonly (readonly [id: string, instance: InstanceSettings])[];

/** One instance's variables under its kind's keys; one its kind requires, left unset, is refused by name. */
function instanceEnv(
  env: NodeJS.ProcessEnv,
  definition: ChannelDefinition,
  id: string,
  instance: InstanceSettings,
  source: string,
): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (const [key, variable] of Object.entries(definition.env)) {
    const name = instance.env[key] ?? key;
    const value = set(env, name);
    if (value === undefined && variable.required) {
      throw new NotificationsConfigError(
        `${source} runs ${id}, which needs ${name}: set it, or choose channels "none"`,
      );
    }
    values[key] = value;
  }
  return values;
}

/** Two instances of a kind reading one value it holds distinct are refused, by their variables and never by the value. */
function refuseShared(
  definition: ChannelDefinition,
  instances: Instances,
  channelEnv: Readonly<Record<string, Readonly<Record<string, string | undefined>>>>,
  source: string,
): void {
  for (const [key, variable] of Object.entries(definition.env)) {
    if (!variable.distinct) continue;
    const holders = new Map<string, { id: string; name: string }>();
    for (const [id, instance] of instances) {
      const value = channelEnv[id]?.[key];
      if (value === undefined) continue;
      const name = instance.env[key] ?? key;
      const other = holders.get(value);
      if (other !== undefined) {
        throw new NotificationsConfigError(
          `${source}: ${other.id} and ${id} read one ${definition.id} ${key}, through ${other.name} and ${name}; each needs its own`,
        );
      }
      holders.set(value, { id, name });
    }
  }
}

/** How the settings are read, given the choices the environment makes: `readSettings` over the package's own files. */
export type ReadSettings = (choices: SettingsChoices) => NotificationsSettings;

/**
 * The one read of the environment: the port, the channels file to run, and
 * the variables every instance that file binds. A port that is not one, a
 * channels name with no file behind it, an instance missing a variable its
 * kind requires, and two instances reading one value their kind holds
 * distinct are refused here by name — never by value — before anything boots.
 */
export function notificationsConfigFromEnv(
  readSettings: ReadSettings,
  definitions: readonly ChannelDefinition[],
  env: NodeJS.ProcessEnv = process.env,
): NotificationsConfig {
  const port = set(env, NOTIFICATIONS_ENV.port.name) ?? NOTIFICATIONS_ENV.port.fallback;
  if (!/^\d{1,5}$/.test(port) || Number(port) === 0 || Number(port) > 65_535) {
    throw new NotificationsConfigError(
      `${NOTIFICATIONS_ENV.port.name} must be a port number, got ${JSON.stringify(port)}`,
    );
  }
  const channels = set(env, NOTIFICATIONS_ENV.channels.name) ?? NOTIFICATIONS_ENV.channels.fallback;
  const settings = readSettings(channels === undefined ? {} : { channels });
  const source = settings.sources.channels;
  const channelEnv: Record<string, Record<string, string | undefined>> = {};
  for (const definition of definitions) {
    const instances: Instances = Object.entries(settings.channels[definition.id]?.instances ?? {});
    for (const [id, instance] of instances) {
      channelEnv[id] = instanceEnv(env, definition, id, instance, source);
    }
    refuseShared(definition, instances, channelEnv, source);
  }
  return { port: Number(port), settings, channelEnv };
}
