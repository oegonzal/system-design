/**
 * Time zones as settings name them, and an instant as a person in one reads
 * it. One schema for every program that declares a zone, so a name the
 * runtime does not know is refused at boot, by name, wherever it is read.
 */
import { z } from 'zod';

const knownZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** An IANA time zone name the runtime knows, such as `Europe/Madrid` or `UTC`. */
export const timeZoneSchema = z
  .string()
  .min(1)
  .refine(knownZone, { message: 'an IANA time zone name the runtime knows' });

/** An instant as a clock in the zone shows it: the weekday, the date, the time of day, and the offset from UTC. */
export interface LocalTime {
  weekday: string;
  date: string;
  time: string;
  offset: string;
}

export function localTimeOf(instant: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const named = read('timeZoneName').replace(/^GMT/, 'UTC');
  return {
    weekday: read('weekday'),
    date: `${read('year')}-${read('month')}-${read('day')}`,
    time: `${read('hour')}:${read('minute')}`,
    offset: named === 'UTC' ? 'UTC+00:00' : named,
  };
}
