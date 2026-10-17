import { suggestSlots } from './scheduling';

/** Pacific time in October: UTC−7, so 09:00 is 16:00Z and 17:00 is 00:00Z the next day. */
const scheduling = {
  timeZone: 'America/Los_Angeles',
  workingHours: { start: '09:00', end: '17:00' },
  workingDays: [1, 2, 3, 4, 5],
  slotMinutes: 30,
};

const slot = (start: string, end: string) => ({ start, end });

describe('suggestSlots', () => {
  it('[GCL-4] offers slots on the grid inside the working hours and days of the time zone that no busy interval touches, in order, as many as asked', () => {
    // Monday 2026-10-19: the first grid slot of the working day is 09:00 Pacific, 16:00Z.
    const monday = { start: '2026-10-19T00:00:00.000Z', end: '2026-10-21T00:00:00.000Z' };
    expect(
      suggestSlots(
        {
          window: monday,
          durationMinutes: 30,
          busy: [{ start: '2026-10-19T16:00:00Z', end: '2026-10-19T16:30:00Z' }],
          count: 3,
        },
        scheduling,
      ),
    ).toEqual([
      slot('2026-10-19T16:30:00.000Z', '2026-10-19T17:00:00.000Z'),
      slot('2026-10-19T17:00:00.000Z', '2026-10-19T17:30:00.000Z'),
      slot('2026-10-19T17:30:00.000Z', '2026-10-19T18:00:00.000Z'),
    ]);
    // A busy interval that overlaps a slot by a minute blocks it; one that only touches it does not.
    expect(
      suggestSlots(
        {
          window: monday,
          durationMinutes: 30,
          busy: [{ start: '2026-10-19T16:29:00Z', end: '2026-10-19T16:31:00Z' }],
          count: 2,
        },
        scheduling,
      ),
    ).toEqual([
      slot('2026-10-19T17:00:00.000Z', '2026-10-19T17:30:00.000Z'),
      slot('2026-10-19T17:30:00.000Z', '2026-10-19T18:00:00.000Z'),
    ]);
  });

  it('[GCL-4] lays the grid on the zone’s own clock, so a zone half an hour off UTC gets slots on its hours, not UTC’s', () => {
    // Monday 2026-10-19 in Kolkata (UTC+5:30): the working day opens at 09:00 there, 03:30Z.
    expect(
      suggestSlots(
        {
          window: { start: '2026-10-19T00:00:00.000Z', end: '2026-10-20T00:00:00.000Z' },
          durationMinutes: 60,
          busy: [],
          count: 2,
        },
        { ...scheduling, timeZone: 'Asia/Kolkata', slotMinutes: 60 },
      ),
    ).toEqual([
      slot('2026-10-19T03:30:00.000Z', '2026-10-19T04:30:00.000Z'),
      slot('2026-10-19T04:30:00.000Z', '2026-10-19T05:30:00.000Z'),
    ]);
  });

  it('[GCL-4] fits the duration before the working day closes, starts a window off the grid at the next grid instant, and finds nothing on a weekend', () => {
    // 15:30 Pacific on the Monday: an hour fits at 15:30 and 16:00, not at 16:30.
    expect(
      suggestSlots(
        {
          window: { start: '2026-10-19T22:30:00.000Z', end: '2026-10-20T00:00:00.000Z' },
          durationMinutes: 60,
          busy: [],
          count: 5,
        },
        scheduling,
      ),
    ).toEqual([
      slot('2026-10-19T22:30:00.000Z', '2026-10-19T23:30:00.000Z'),
      slot('2026-10-19T23:00:00.000Z', '2026-10-20T00:00:00.000Z'),
    ]);
    expect(
      suggestSlots(
        {
          window: { start: '2026-10-19T16:10:00.000Z', end: '2026-10-19T18:00:00.000Z' },
          durationMinutes: 30,
          busy: [],
          count: 1,
        },
        scheduling,
      ),
    ).toEqual([slot('2026-10-19T16:30:00.000Z', '2026-10-19T17:00:00.000Z')]);
    // Saturday and Sunday Pacific: the window ends before Monday begins there.
    expect(
      suggestSlots(
        {
          window: { start: '2026-10-17T00:00:00.000Z', end: '2026-10-19T06:00:00.000Z' },
          durationMinutes: 30,
          busy: [],
          count: 3,
        },
        scheduling,
      ),
    ).toEqual([]);
  });
});
