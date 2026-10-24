import { TARGET_CSV_COLUMNS, targetsCsv } from './target-csv';
import { targetOf } from './target-fixtures';

describe('the tracker as a sheet', () => {
  it('[GOV-38] writes the declared columns as the header and one line per target — the first contact with its role, the latest activity by its day — quoting a cell with a comma, a quote or a line break and doubling its quotes, lines ended the RFC’s way', () => {
    const plain = targetOf();
    const rich = targetOf({
      id: 't-2',
      kind: 'firm',
      subject: 'JCBMLGPE6Z71',
      label: 'BOOZ ALLEN HAMILTON INC',
      stage: 'contacted',
      nextAction: 'Ask, then "wait"',
      contacts: [{ name: 'Jane Doe', role: 'sblo', channel: 'teaming@example.com', note: '' }],
      links: [{ kind: 'website', url: 'https://www.example.com/', label: 'Site' }],
      activity: [
        {
          at: '2026-09-25T14:00:00.000Z',
          kind: 'emailed',
          summary: 'Sent the statement.',
          ref: null,
        },
        { at: '2026-09-20T10:00:00.000Z', kind: 'registered', summary: 'Portal', ref: null },
      ],
      notes: 'two\nlines',
      reminderAt: '2026-09-29T15:00:00.000Z',
      endsAt: null,
    });
    const lines = targetsCsv([plain, rich]).split('\r\n');
    expect(lines[0]).toBe(TARGET_CSV_COLUMNS.map((column) => column.header).join(','));
    expect(lines[1]).toBe(
      'award,89303019FET000003,CONT_AWD_89303019FET000003_8900_89303019AET000001_8900,watching,2026-09-27,,,—,,2026-12-26,,',
    );
    expect(lines[2]).toBe(
      'firm,BOOZ ALLEN HAMILTON INC,JCBMLGPE6Z71,contacted,2026-09-27,Jane Doe (sblo) teaming@example.com,"Ask, then ""wait""",2026-09-29,2026-09-25 emailed: Sent the statement.,—,https://www.example.com/,"two\nlines"',
    );
    expect(lines.at(-1)).toBe('');
  });
});
