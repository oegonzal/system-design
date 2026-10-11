import { z } from 'zod';

import type { ChannelDefinition, ChannelLog, NotificationChannel } from './port';

/**
 * Every channel the service can run, declared once. A channel is its own
 * folder and one line here: its settings join the `channels` settings kind,
 * its variables join the service's declared environment, and nothing else in
 * the package names it.
 */
export const CHANNEL_DEFINITIONS: readonly ChannelDefinition[] = [];

/** The `channels` settings: one optional entry per declared channel, and a channel runs exactly when its entry is present. */
export const channelSettingsSchema = z.strictObject(
  Object.fromEntries(
    CHANNEL_DEFINITIONS.map((definition) => [definition.id, definition.settings.optional()]),
  ),
);
export type ChannelSettings = Readonly<Record<string, unknown>>;

/** The channels the settings choose, each built from its own settings and variables. */
export function createChannels(
  settings: ChannelSettings,
  env: Readonly<Record<string, Readonly<Record<string, string | undefined>>>>,
  logOf: (channel: string) => ChannelLog,
): NotificationChannel[] {
  return CHANNEL_DEFINITIONS.filter((definition) => settings[definition.id] !== undefined).map(
    (definition) =>
      definition.create({
        settings: settings[definition.id],
        env: env[definition.id] ?? {},
        log: logOf(definition.id),
      }),
  );
}
