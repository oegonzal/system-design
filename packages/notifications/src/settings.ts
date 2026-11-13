import { relative, resolve } from 'node:path';

import { CONFIG_DIR, ENGINE_FILE, readChosen, type ReadFile } from '@sysdesign/config-kit';
import type { z } from 'zod';

import { busSettingsSchema, type BusSettings } from './bus';
import { channelSettingsSchema, type ChannelSettings } from './channels';
import { NotificationsConfigError } from './config';
import { interactionSettingsSchema, type InteractionSettings } from './interactions';

/**
 * The service's settings, as files: the package's own `config/`, laid out the
 * way the repository's is — `config/engine.json` names one file per kind, and
 * each kind's files sit side by side under `config/<kind>/`, complete and
 * readable on their own. Each layer declares the schema of its own kind; this
 * reads them, refuses a kind left unchosen by naming where the choices were
 * looked for, and checks what one kind promises another. A caller may choose
 * a kind's file itself — the environment names the channels a deployment
 * runs — and its choice wins over the engine file's for that kind.
 */
type SettingsKind = 'bus' | 'interactions' | 'channels';

/** A file name per kind the caller chooses itself; a kind left out is the engine file's to choose. */
export type SettingsChoices = Partial<Record<SettingsKind, string>>;

export interface NotificationsSettings {
  bus: BusSettings;
  interactions: InteractionSettings;
  /** One entry per channel kind to run, listing the instances it runs. */
  channels: ChannelSettings;
  /** Where each kind's settings came from, as a path from the working directory. */
  sources: Readonly<Record<SettingsKind, string>>;
}

export function readSettings(
  root: string,
  read?: ReadFile,
  choices: SettingsChoices = {},
): NotificationsSettings {
  const chosen = <T>(kind: SettingsKind, schema: z.ZodType<T>): { config: T; source: string } => {
    const found = readChosen(kind, schema, root, read, choices[kind]);
    if (found === null) {
      throw new NotificationsConfigError(
        `${resolve(root, CONFIG_DIR, ENGINE_FILE)} chooses no ${kind}: name a file under ${resolve(root, CONFIG_DIR, kind)}`,
      );
    }
    return { config: found.config, source: relative(process.cwd(), resolve(root, found.source)) };
  };
  const bus = chosen('bus', busSettingsSchema);
  const interactions = chosen('interactions', interactionSettingsSchema);
  const channels = chosen('channels', channelSettingsSchema);
  // The dispatcher is a subscriber like any other: it asks within what the bus allows one.
  if (interactions.config.pullWaitMs > bus.config.maxWaitMs) {
    throw new NotificationsConfigError(
      `${interactions.source}: pullWaitMs ${interactions.config.pullWaitMs} is above ${bus.source}'s maxWaitMs ${bus.config.maxWaitMs}`,
    );
  }
  if (interactions.config.eventsPerPull > bus.config.maxEventsPerPull) {
    throw new NotificationsConfigError(
      `${interactions.source}: eventsPerPull ${interactions.config.eventsPerPull} is above ${bus.source}'s maxEventsPerPull ${bus.config.maxEventsPerPull}`,
    );
  }
  return {
    bus: bus.config,
    interactions: interactions.config,
    channels: channels.config,
    sources: { bus: bus.source, interactions: interactions.source, channels: channels.source },
  };
}
