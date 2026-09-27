import {
  describeQuery,
  type LeadDetailDto,
  type LeadsReport,
  type PullReport,
} from '@sysdesign/contracts';

/**
 * stdout for humans. Fixed-width tables built with padEnd — no dependency, and
 * `--json` prints the report objects untouched for anything else.
 */
const clip = (text: string | null, width: number): string => {
  const value = text ?? '—';
  return value.length > width ? `${value.slice(0, width - 1)}…` : value;
};

const day = (iso: string | null): string => (iso === null ? '—' : iso.slice(0, 10));

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((title, index) =>
    Math.max(title.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join('  ')
      .trimEnd();
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join(
    '\n',
  );
}

const agencyOf = (path: string | null): string | null => {
  if (path === null) return null;
  const parts = path.split('.').filter((part) => part.trim().length > 0);
  return parts[parts.length - 1] ?? path;
};

export function renderPull(report: PullReport): string {
  const rows = report.slices.map((slice) => [
    slice.outcome,
    describeQuery(slice.query),
    String(slice.pages),
    String(slice.received),
    String(slice.inserted),
    String(slice.updated),
    String(slice.rejected),
    `${slice.truncated ? 'truncated' : ''}${slice.truncated && slice.detail ? ' · ' : ''}${slice.detail ?? ''}`,
  ]);
  const counts = (outcome: string) =>
    report.slices.filter((slice) => slice.outcome === outcome).length;
  const stored = report.slices.reduce((total, slice) => total + slice.inserted + slice.updated, 0);
  const lines = [
    `pull · profile ${report.profile} · posted ${report.window.from}..${report.window.to} · source ${report.source.id}${
      report.source.availability.enabled ? '' : ` (disabled: ${report.source.availability.reason})`
    }`,
    table(
      ['outcome', 'slice', 'pages', 'received', 'inserted', 'updated', 'rejected', 'note'],
      rows,
    ),
    `budget: ${report.spent === null ? '?' : report.spent}/${report.budget} attempts in the last 24h · ${stored} stored · ${counts('cached')} cached · ${counts('budget-exhausted') + counts('skipped')} not pulled${
      report.stoppedBy ? ` (stopped: ${report.stoppedBy})` : ''
    }`,
  ];
  return lines.join('\n');
}

export function renderLeads(report: LeadsReport): string {
  const rows = report.leads.map((lead, index) => [
    String(index + 1),
    lead.score.toFixed(1),
    lead.tier ?? '—',
    day(lead.opportunity.responseDeadlineAt),
    lead.opportunity.setAsideCode ?? 'open',
    lead.opportunity.naicsCode ?? '—',
    clip(agencyOf(lead.opportunity.agencyPath), 26),
    clip(lead.opportunity.title, 58),
    lead.opportunity.uiLink ?? lead.opportunity.noticeId,
  ]);
  return [
    `leads · profile ${report.profile} · ${report.candidates} candidate(s), ${report.excluded} excluded by gate, ${report.matching} over the filters, ${report.leads.length} shown`,
    rows.length > 0
      ? table(
          ['#', 'score', 'tier', 'deadline', 'set-aside', 'naics', 'agency', 'title', 'link'],
          rows,
        )
      : '(no leads — pull first, or lower --min-score)',
  ].join('\n');
}

export function renderLead(lead: LeadDetailDto): string {
  const o = lead.opportunity;
  const head = [
    `${o.title}`,
    `notice ${o.noticeId} · ${o.noticeType ?? 'type unknown'} · posted ${day(o.postedAt)} · deadline ${day(
      o.responseDeadlineAt,
    )} · ${o.active === null ? 'activity unknown' : o.active ? 'active' : 'inactive'}`,
    `agency ${o.agencyPath ?? '—'}`,
    `naics ${o.naicsCodes.join(', ') || '—'} · psc ${o.classificationCode ?? '—'} · set-aside ${
      o.setAsideCode ?? 'open'
    }${o.setAsideDescription ? ` (${o.setAsideDescription})` : ''}`,
    `solicitation ${o.solicitationNumber ?? '—'} · ${o.uiLink ?? 'no link'}`,
    o.pointsOfContact.length > 0
      ? `contact ${o.pointsOfContact
          .map((c) => [c.fullName, c.email, c.phone].filter(Boolean).join(' '))
          .join(' · ')}`
      : 'contact —',
    lead.excluded
      ? `EXCLUDED by ${lead.excluded.factor}: ${lead.excluded.reason}`
      : `score ${lead.score.toFixed(1)} · tier ${lead.tier}`,
  ];
  const description = lead.description
    ? [`description (fetched ${day(lead.description.fetchedAt)})`, lead.description.text]
    : ['description not fetched — `show <noticeId> --describe` spends one request'];
  const trace = table(
    ['factor', 'value', 'weight', 'points', 'evidence'],
    lead.factors.map((f) => [
      f.id,
      f.value.toFixed(2),
      f.weight.toFixed(2),
      f.points.toFixed(1),
      f.evidence.join('; '),
    ]),
  );
  return [...head, '', trace, '', ...description].join('\n');
}
