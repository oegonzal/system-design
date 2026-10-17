import { relative, resolve } from 'node:path';

import { CONFIG_DIR, ENGINE_FILE, readChosen, type ReadFile } from '@sysdesign/config-kit';
import { recoverySchema, timeZoneSchema } from '@sysdesign/contracts';
import { toolSessionSettingsSchema, type ToolSessionSettings } from '@sysdesign/tool-session';
import { z } from 'zod';

import { GoogleCalendarConfigError } from './config';

/**
 * The service's settings, as files under the package's own `config/`, laid
 * out the way the repository's is: `config/engine.json` names one file per
 * kind and each kind's files sit under `config/<kind>/`. Every kind must be
 * chosen; a choice that is missing is a refusal naming where the choices
 * were looked for, never a quiet default.
 */
const positive = z.number().int().positive();

/** The change watcher: whether it runs, how often it syncs, how long its notices stay, and which calendar it watches. */
export const watchSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  pollEveryMs: positive,
  noticeTtlMs: positive,
  /** The calendar watched, by its id; `primary` for the account's own. */
  calendarId: z.string().min(1),
});
export type WatchSettings = z.infer<typeof watchSettingsSchema>;

/** The programs whose tools join every session, by the ids `config.ts` binds to URLs. */
export const peersSettingsSchema = z.strictObject({ peers: z.array(z.string().min(1)) });

/** A time of day as the clock shows it, `HH:MM`. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time of day as HH:MM');

/** When a meeting may be put: the time zone, the working hours and days, and the grid slots sit on. */
export const schedulingSettingsSchema = z
  .strictObject({
    timeZone: timeZoneSchema,
    workingHours: z.strictObject({ start: clockTime, end: clockTime }),
    /** Days of the week, Sunday 0 through Saturday 6. */
    workingDays: z.array(z.number().int().min(0).max(6)).min(1),
    slotMinutes: positive,
  })
  .refine((settings) => settings.workingHours.start < settings.workingHours.end, {
    message: 'the working hours must start before they end',
  });
export type SchedulingSettings = z.infer<typeof schedulingSettingsSchema>;

/** How much of the calendar a tool answers with, and how a call rides out a rate limit. */
export const calendarSettingsSchema = z.strictObject({
  /** Events a list or a search answers with when the call names no count. */
  listMax: positive,
  /** The most events one list may answer with. */
  listCeiling: positive,
  /** Slots suggested when the call names no count. */
  suggestMax: positive,
  /** The most slots one call may suggest. */
  suggestCeiling: positive,
  /** How long a call to the calendar rides out a rate limit or a server error. */
  recovery: recoverySchema,
});
export type CalendarSettings = z.infer<typeof calendarSettingsSchema>;

type SettingsKind = 'session' | 'watch' | 'peers' | 'scheduling' | 'calendar';

export interface GoogleCalendarSettings {
  session: ToolSessionSettings;
  watch: WatchSettings;
  peers: z.infer<typeof peersSettingsSchema>;
  scheduling: SchedulingSettings;
  calendar: CalendarSettings;
  /** Where each kind's settings came from, as a path from the working directory. */
  sources: Readonly<Record<SettingsKind, string>>;
}

export function readSettings(root: string, read?: ReadFile): GoogleCalendarSettings {
  const chosen = <T>(kind: SettingsKind, schema: z.ZodType<T>): { config: T; source: string } => {
    const found = readChosen(kind, schema, root, read);
    if (found === null) {
      throw new GoogleCalendarConfigError(
        `${resolve(root, CONFIG_DIR, ENGINE_FILE)} chooses no ${kind}: name a file under ${resolve(root, CONFIG_DIR, kind)}`,
      );
    }
    return { config: found.config, source: relative(process.cwd(), resolve(root, found.source)) };
  };
  const session = chosen('session', toolSessionSettingsSchema);
  const watch = chosen('watch', watchSettingsSchema);
  const peers = chosen('peers', peersSettingsSchema);
  const scheduling = chosen('scheduling', schedulingSettingsSchema);
  const calendar = chosen('calendar', calendarSettingsSchema);
  return {
    session: session.config,
    watch: watch.config,
    peers: peers.config,
    scheduling: scheduling.config,
    calendar: calendar.config,
    sources: {
      session: session.source,
      watch: watch.source,
      peers: peers.source,
      scheduling: scheduling.source,
      calendar: calendar.source,
    },
  };
}
