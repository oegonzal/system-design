import { describe, expect, it } from 'vitest';

import { localTimeOf, timeZoneSchema } from './time-zone';

describe('time zones', () => {
  it('[QL-72] refuses a zone name the runtime does not know, and reads an instant as a clock in the zone shows it, the date included', () => {
    expect(timeZoneSchema.safeParse('America/Los_Angeles').success).toBe(true);
    expect(timeZoneSchema.safeParse('UTC').success).toBe(true);
    expect(timeZoneSchema.safeParse('Mars/Olympus').success).toBe(false);
    expect(timeZoneSchema.safeParse('').success).toBe(false);
    // Saturday in UTC is still Friday evening on the US west coast.
    const instant = new Date('2026-10-17T03:55:00.000Z');
    expect(localTimeOf(instant, 'America/Los_Angeles')).toEqual({
      weekday: 'Friday',
      date: '2026-10-16',
      time: '20:55',
      offset: 'UTC-07:00',
    });
    expect(localTimeOf(instant, 'UTC')).toEqual({
      weekday: 'Saturday',
      date: '2026-10-17',
      time: '03:55',
      offset: 'UTC+00:00',
    });
    expect(localTimeOf(instant, 'Asia/Kolkata').offset).toBe('UTC+05:30');
  });
});
