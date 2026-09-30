import {
  agencyOf,
  clip,
  day,
  describeQuery,
  summarizePull,
  type EntityLookup,
  type FetchAwardsReport,
  type LeadsReport,
  type NoticeDto,
  type PullReport,
  type StoredProfile,
} from '@sysdesign/contracts';

/**
 * stdout for humans. Fixed-width tables built with padEnd — no dependency, and
 * `--json` prints the report objects untouched for anything else.
 */
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
  const lines = [
    `pull · profile ${report.profile} · posted ${report.window.from}..${report.window.to} · source ${report.source.id}${
      report.source.availability.enabled ? '' : ` (disabled: ${report.source.availability.reason})`
    }`,
    table(
      ['outcome', 'slice', 'pages', 'received', 'inserted', 'updated', 'rejected', 'note'],
      rows,
    ),
    summarizePull(report),
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
    `leads · profile ${report.profile} · ${report.candidates} candidate(s)${report.capped ? ' (capped)' : ''}, ${report.excluded} excluded by gate, ${report.matching} over the filters, ${report.leads.length} shown from ${report.offset}`,
    rows.length > 0
      ? table(
          ['#', 'score', 'tier', 'deadline', 'set-aside', 'naics', 'agency', 'title', 'link'],
          rows,
        )
      : '(no leads — pull first, or lower --min-score)',
  ].join('\n');
}

export function renderLead(lead: NoticeDto): string {
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
    : ['description not fetched — `show <noticeId> --description` spends one request'];
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

export function renderAwardsFetch(report: FetchAwardsReport): string {
  const rows = report.slices.map((slice) => [
    slice.source,
    slice.code,
    slice.outcome,
    String(slice.pages),
    String(slice.received),
    String(slice.inserted),
    String(slice.updated),
    `${slice.truncated ? 'truncated' : ''}${slice.truncated && slice.detail ? ' · ' : ''}${slice.detail ?? ''}`,
  ]);
  return [
    table(['source', 'code', 'outcome', 'pages', 'received', 'inserted', 'updated', 'note'], rows),
    `budget: ${report.spent === null ? '?' : report.spent}/${report.budget} sam.gov attempts in the last 24h`,
  ].join('\n');
}

export function renderEntities(lookup: EntityLookup): string {
  const rows = lookup.entities.map((entity) => [
    entity.uei,
    entity.cage ?? '—',
    clip(entity.legalName, 40),
    entity.registrationStatus ?? '—',
    entity.registrationExpiresAt ?? '—',
    entity.excluded ? 'EXCLUDED' : 'no',
    entity.naics.map((n) => `${n.code}${n.small === true ? '*' : ''}`).join(' '),
    entity.sbaCertifications.join(' ') || '—',
  ]);
  return [
    rows.length > 0
      ? table(
          ['uei', 'cage', 'name', 'status', 'expires', 'excluded', 'naics (* small)', 'sba'],
          rows,
        )
      : '(no registrant found)',
    lookup.unknown.length > 0 ? `unknown: ${lookup.unknown.join(', ')}` : '',
    `budget: ${lookup.spent === null ? '?' : lookup.spent}/${lookup.budget} sam.gov attempts in the last 24h`,
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

export function renderProfiles(profiles: readonly StoredProfile[]): string {
  return table(
    ['id', 'company', 'default', 'uei', 'naics', 'horizon', 'updated'],
    profiles.map((profile) => [
      profile.id,
      clip(profile.company, 30),
      profile.isDefault ? 'yes' : '',
      profile.entityUei ?? '—',
      profile.naics.join(' '),
      `${profile.leads.horizonDays}d`,
      day(profile.updatedAt),
    ]),
  );
}
