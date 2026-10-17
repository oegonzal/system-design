import { readFileSync } from 'node:fs';

import { GoogleCalendarConfigError, PACKAGE_ROOT } from './config';
import { readSettings, schedulingSettingsSchema } from './settings';

describe('the service settings', () => {
  it('[GCL-2] reads the five kinds the package ships, says where each came from, and refuses a kind left unchosen by name', () => {
    const settings = readSettings(PACKAGE_ROOT);
    expect(settings.session.rails.maxSteps).toBeGreaterThan(0);
    expect(settings.watch).toEqual({
      enabled: true,
      pollEveryMs: 120_000,
      noticeTtlMs: 604_800_000,
      calendarId: 'primary',
    });
    expect(settings.peers.peers).toEqual(['gmail']);
    expect(settings.scheduling.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(settings.calendar.listMax).toBeLessThanOrEqual(settings.calendar.listCeiling);
    expect(settings.calendar.suggestMax).toBeLessThanOrEqual(settings.calendar.suggestCeiling);
    expect(settings.sources).toEqual({
      session: 'packages/google-calendar/config/session/standard.json',
      watch: 'packages/google-calendar/config/watch/standard.json',
      peers: 'packages/google-calendar/config/peers/standard.json',
      scheduling: 'packages/google-calendar/config/scheduling/standard.json',
      calendar: 'packages/google-calendar/config/calendar/standard.json',
    });
    const without = (kind: string) => (at: string) => {
      if (at.endsWith('engine.json'))
        return JSON.stringify({
          session: 'standard',
          watch: 'standard',
          peers: 'standard',
          scheduling: 'standard',
          calendar: 'standard',
          [kind]: undefined,
        });
      return readFileSync(at, 'utf8');
    };
    expect(() => readSettings(PACKAGE_ROOT, without('scheduling'))).toThrow(
      GoogleCalendarConfigError,
    );
    expect(() => readSettings(PACKAGE_ROOT, without('scheduling'))).toThrow(
      /chooses no scheduling/,
    );
  });

  it('[GCL-2] refuses scheduling settings the slot finder could not work from: a time zone the runtime does not know, hours out of order, a clock time malformed', () => {
    const sound = {
      timeZone: 'Europe/Madrid',
      workingHours: { start: '08:30', end: '16:00' },
      workingDays: [1, 2, 3],
      slotMinutes: 15,
    };
    expect(schedulingSettingsSchema.safeParse(sound).success).toBe(true);
    expect(schedulingSettingsSchema.safeParse({ ...sound, timeZone: 'Mars/Olympus' }).success).toBe(
      false,
    );
    expect(
      schedulingSettingsSchema.safeParse({
        ...sound,
        workingHours: { start: '17:00', end: '09:00' },
      }).success,
    ).toBe(false);
    expect(
      schedulingSettingsSchema.safeParse({ ...sound, workingHours: { start: '9am', end: '16:00' } })
        .success,
    ).toBe(false);
  });
});
