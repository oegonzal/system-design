import { day } from './format';
import type { Target } from './target';

/**
 * The tracker as a sheet: one declared column per fact a spreadsheet row of
 * it carries, so the client's download and anything else that writes the
 * sheet spell the same header and the same cells. RFC 4180: a cell holding a
 * comma, a quote or a line break is quoted, and a quote is doubled.
 */
export interface TargetCsvColumn {
  header: string;
  cell(target: Target): string;
}

const joined = (parts: readonly string[]): string => parts.join('; ');

export const TARGET_CSV_COLUMNS: readonly TargetCsvColumn[] = [
  { header: 'Kind', cell: (target) => target.kind },
  { header: 'Name', cell: (target) => target.label },
  { header: 'Subject', cell: (target) => target.subject },
  { header: 'Stage', cell: (target) => target.stage },
  { header: 'Stage since', cell: (target) => day(target.stageChangedAt) },
  {
    header: 'Contacts',
    cell: (target) =>
      joined(
        target.contacts.map((contact) =>
          `${contact.name} (${contact.role}) ${contact.channel}`.trim(),
        ),
      ),
  },
  { header: 'Next action', cell: (target) => target.nextAction },
  { header: 'Reminder', cell: (target) => day(target.reminderAt) },
  {
    header: 'Last activity',
    cell: (target) => {
      const [last] = [...target.activity].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return last === undefined ? '' : `${day(last.at)} ${last.kind}: ${last.summary}`;
    },
  },
  { header: 'Ends', cell: (target) => day(target.endsAt) },
  { header: 'Links', cell: (target) => joined(target.links.map((link) => link.url)) },
  { header: 'Notes', cell: (target) => target.notes },
];

const quoted = (cell: string): string =>
  /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;

/** The rows as one CSV document, header first, lines ended the RFC's way. */
export const targetsCsv = (targets: readonly Target[]): string =>
  [
    TARGET_CSV_COLUMNS.map((column) => quoted(column.header)).join(','),
    ...targets.map((target) =>
      TARGET_CSV_COLUMNS.map((column) => quoted(column.cell(target))).join(','),
    ),
  ].join('\r\n') + '\r\n';
