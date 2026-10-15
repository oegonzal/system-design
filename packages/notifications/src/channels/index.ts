import { z } from 'zod';

import {
  CHANNEL_ID,
  PUBLISHER,
  type ChannelDefinition,
  type ChannelInstance,
  type ChannelLog,
} from './port';
import { TELEGRAM } from './telegram/definition';

/** A channel's definition with its settings read back through its own schema, so the registry holds every channel alike. */
const declared = <S>(definition: ChannelDefinition<S>): ChannelDefinition => ({
  ...definition,
  create: (input) =>
    definition.create({ ...input, settings: definition.settings.parse(input.settings) }),
});

/**
 * Every channel kind the service can run, declared once. A kind is its own
 * folder and one line here: its settings and its instances join the
 * `channels` settings kind, and nothing else in the package names it.
 */
export const CHANNEL_DEFINITIONS: readonly ChannelDefinition[] = [declared(TELEGRAM)];

/** One instance as the channels file declares it: the publishers it carries, and the variable it binds to each key its kind declares. */
export interface InstanceSettings {
  carries: readonly string[];
  env: Readonly<Record<string, string>>;
}

/** One kind as the channels file declares it: the settings its instances share, and each instance by its id. */
interface KindSettings {
  settings: unknown;
  instances: Readonly<Record<string, InstanceSettings>>;
}

/** The `channels` settings: one optional entry per declared kind, which runs exactly the instances its entry lists. */
export type ChannelSettings = Readonly<Record<string, KindSettings | undefined>>;

const VARIABLE_NAME = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, { message: 'a variable is named in capitals' });

const kindSchema = (definition: ChannelDefinition) =>
  z.strictObject({
    settings: definition.settings,
    instances: z
      .record(
        CHANNEL_ID,
        z.strictObject({
          carries: z.array(PUBLISHER).min(1),
          // Every key bound: whether its variable must be set is the kind's to say.
          env: z.strictObject(
            Object.fromEntries(Object.keys(definition.env).map((key) => [key, VARIABLE_NAME])),
          ),
        }),
      )
      .refine((instances) => Object.keys(instances).length > 0, {
        message: 'a kind runs at least one instance',
      }),
  });

/** The `channels` settings over these kinds; an instance id names one channel across all of them. */
export function channelSettingsSchemaOf(
  definitions: readonly ChannelDefinition[],
): z.ZodType<ChannelSettings> {
  return z
    .strictObject(
      Object.fromEntries(
        definitions.map((definition) => [definition.id, kindSchema(definition).optional()]),
      ),
    )
    .superRefine((kinds, context) => {
      const seen = new Set<string>();
      for (const kind of Object.values(kinds)) {
        for (const id of Object.keys(kind?.instances ?? {})) {
          if (seen.has(id))
            context.addIssue({ code: 'custom', message: `${id} is declared twice` });
          seen.add(id);
        }
      }
    });
}

export const channelSettingsSchema = channelSettingsSchemaOf(CHANNEL_DEFINITIONS);

/** The instances the settings run, each built from its kind's settings and its own variables, beside the publishers it carries. */
export function createChannels(
  definitions: readonly ChannelDefinition[],
  settings: ChannelSettings,
  env: Readonly<Record<string, Readonly<Record<string, string | undefined>>>>,
  logOf: (channel: string) => ChannelLog,
): ChannelInstance[] {
  return definitions.flatMap((definition) => {
    const kind = settings[definition.id];
    if (kind === undefined) return [];
    return Object.entries(kind.instances).map(([id, instance]) => ({
      carries: instance.carries,
      channel: definition.create({
        id,
        settings: kind.settings,
        env: env[id] ?? {},
        variables: instance.env,
        log: logOf(id),
      }),
    }));
  });
}

/** Each instance the settings run and what it carries, as the service says it at start. */
export function describeChannels(settings: ChannelSettings): string {
  const running = Object.values(settings).flatMap((kind) =>
    Object.entries(kind?.instances ?? {}).map(
      ([id, instance]) => `${id} carries ${instance.carries.join(', ')}`,
    ),
  );
  return running.length === 0 ? 'none' : running.join('; ');
}
