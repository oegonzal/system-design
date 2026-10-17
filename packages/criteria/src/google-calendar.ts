import type { Criterion } from './criterion';

/** The calendar service (packages/google-calendar). */
export const GOOGLE_CALENDAR_CRITERIA: readonly Criterion[] = [
  {
    id: 'GCL-1',
    statement:
      'The calendar service says what it saw and did on the bus under its own source — an event created, changed or cancelled, an invitation waiting for an answer — through topics declared once in the contracts with strict payloads.',
  },
  {
    id: 'GCL-2',
    statement:
      'The service’s configuration is one declared module: its port, the loop, the bus and each peer the settings name read from the environment there alone, a bad value or a peer no variable locates refused by name; and its settings are files under its own config/ — the session, the watcher, the peers, the scheduling rules and the calendar — each kind chosen by name and refused when unchosen, the scheduling rules refused when the slot finder could not work from them.',
  },
  {
    id: 'GCL-3',
    statement:
      'The Calendar REST adapter fills the calendar port call by call — calendars listed, a window’s events as single instances in start order, an event read whole, created, changed or removed with its attendees told, an invitation answered on the account’s own entry alone, free/busy read, and the calendar synced by token with a token the calendar refuses read as expired — every call authorized and every answer read by its schema.',
  },
  {
    id: 'GCL-4',
    statement:
      'A free slot is found deterministically: the instants of the window on the declared grid, inside the declared working hours and days of the declared time zone, that no busy interval of any calendar asked overlaps — in order, as many as asked, and none when the window holds none; no model picks.',
  },
  {
    id: 'GCL-5',
    statement:
      'The nine tools are declared once over the calendar port with their parameters as schemas: five reads asking nobody, three writes and one irreversible removal each waiting for the operator, each answering in words a plan reads with the ids a later call takes, a missing event and an answer to an event that does not invite the account read as refusals, every write said on the bus, and the attendees whose free/busy is not shared named when slots are suggested.',
  },
  {
    id: 'GCL-6',
    statement:
      'The change watcher syncs the calendar from when the service starts and tells nothing of what was there; each poll continues from the sync token, says each event changed since on the bus as created, changed or cancelled and an unanswered invitation as one, tells a person of the poll’s changes in one notice, and on a token the calendar refuses starts again from now; the watcher is off by a setting.',
  },
  {
    id: 'GCL-7',
    statement:
      'The service composes the calendar behind its port, the tools over it, the sessions the loop decides for them and the watcher, serves health, sessions and tools over HTTP, and runs one mission or the consent from its command line — a configuration problem exiting 2 by name.',
  },
];
