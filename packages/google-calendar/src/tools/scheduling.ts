import type { BusyInterval } from '../calendar';
import type { SchedulingSettings } from '../settings';

/**
 * Free slots, deterministically: the instants of the window on the declared
 * grid of the declared time zone's clock, within its working hours and days,
 * that no busy interval of any calendar asked touches. No model: a slot is
 * free or it is not.
 */
export interface Slot {
  start: string;
  end: string;
}

interface Local {
  weekday: number;
  minutes: number;
}

const WEEKDAYS: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

/** The instant as the time zone's clock shows it: the weekday and the minutes since midnight. */
function localOf(instant: Date, timeZone: string): Local {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return {
    weekday: WEEKDAYS[read('weekday')] ?? -1,
    minutes: Number(read('hour')) * 60 + Number(read('minute')),
  };
}

/** How far the zone's clock runs ahead of UTC at the instant, in minutes; behind is negative. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const local = localOf(instant, timeZone);
  const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes();
  const dayApart = (local.weekday - instant.getUTCDay() + 7) % 7;
  const days = dayApart === 1 ? 1 : dayApart === 6 ? -1 : 0;
  return local.minutes - utcMinutes + days * DAY_MINUTES;
}

const minutesOf = (clock: string): number => {
  const [hours = '0', minutes = '0'] = clock.split(':');
  return Number(hours) * 60 + Number(minutes);
};

const overlaps = (start: number, end: number, busy: readonly BusyInterval[]): boolean =>
  busy.some((interval) => Date.parse(interval.start) < end && Date.parse(interval.end) > start);

/** The first instant at or after `from` on the grid of the zone's own clock, whatever its offset from UTC. */
function onLocalGrid(from: number, slotMs: number, timeZone: string): number {
  const offsetMs = offsetMinutes(new Date(from), timeZone) * MINUTE_MS;
  return Math.ceil((from + offsetMs) / slotMs) * slotMs - offsetMs;
}

export interface SuggestInput {
  window: { start: string; end: string };
  durationMinutes: number;
  busy: readonly BusyInterval[];
  count: number;
}

/** The first `count` free slots of the window, in order; none when the window holds none. */
export function suggestSlots(input: SuggestInput, scheduling: SchedulingSettings): Slot[] {
  const slotMs = scheduling.slotMinutes * MINUTE_MS;
  const durationMs = input.durationMinutes * MINUTE_MS;
  const open = minutesOf(scheduling.workingHours.start);
  const close = minutesOf(scheduling.workingHours.end);
  const until = Date.parse(input.window.end);
  const slots: Slot[] = [];
  for (
    let start = onLocalGrid(Date.parse(input.window.start), slotMs, scheduling.timeZone);
    start + durationMs <= until && slots.length < input.count;
    start = onLocalGrid(start + slotMs, slotMs, scheduling.timeZone)
  ) {
    const local = localOf(new Date(start), scheduling.timeZone);
    if (!scheduling.workingDays.includes(local.weekday)) continue;
    if (local.minutes < open || local.minutes + input.durationMinutes > close) continue;
    const end = start + durationMs;
    if (overlaps(start, end, input.busy)) continue;
    slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  }
  return slots;
}
