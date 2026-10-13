import { agencyOf, clip, day, rangeLabel, type LeadsReport } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { noticeHref } from '../notice-href';
import { TIER_TONE } from '../tones';

/** The columns, as data: the header vocabulary and how each row renders it. */
export interface LeadTableProps {
  report: LeadsReport;
  /** The row that is open, when one is. */
  activeNoticeId?: string | null;
  /** A shorter heading for a panel that is one of several. */
  heading?: string;
}

/** The ranking as the service returned it; the title opens the notice, the link opens sam.gov. */
export function LeadTable({ report, activeNoticeId = null, heading = 'Leads' }: LeadTableProps) {
  const Link = useLink();
  return (
    <Stack gap={3}>
      <Heading level={2}>{heading}</Heading>
      <Text tone="secondary" size="sm">
        {report.candidates} candidate(s){report.capped ? ' (capped — narrow the filters)' : ''} ·{' '}
        {report.excluded} excluded by a gate · {report.matching} over the filters · showing{' '}
        {rangeLabel(report.offset, report.leads.length, report.matching)}
      </Text>
      {report.leads.length === 0 ? (
        <Text tone="muted" size="sm">
          No leads — pull first, or lower the minimum score.
        </Text>
      ) : (
        <Table aria-label={heading}>
          <thead>
            <tr>
              <th>#</th>
              <th>Score</th>
              <th>Tier</th>
              <th>Deadline</th>
              <th>Set-aside</th>
              <th>NAICS</th>
              <th>Agency</th>
              <th>Title</th>
              <th>Notice</th>
            </tr>
          </thead>
          <tbody>
            {report.leads.map((lead, index) => {
              const o = lead.opportunity;
              const active = o.noticeId === activeNoticeId;
              return (
                <tr key={o.noticeId}>
                  <td>{report.offset + index + 1}</td>
                  <td>{lead.score.toFixed(1)}</td>
                  <td>
                    {lead.tier ? <Badge tone={TIER_TONE[lead.tier]}>{lead.tier}</Badge> : '—'}
                  </td>
                  <td>{day(o.responseDeadlineAt)}</td>
                  <td>{o.setAsideCode ?? 'open'}</td>
                  <td>{o.naicsCode ?? '—'}</td>
                  <td>{clip(agencyOf(o.agencyPath), 36)}</td>
                  <td>
                    <Link
                      href={noticeHref(o.noticeId)}
                      $variant="inline"
                      $active={active}
                      aria-current={active ? 'true' : undefined}
                    >
                      {clip(o.title, 70)}
                    </Link>
                  </td>
                  <td>
                    {o.uiLink ? (
                      <a href={o.uiLink} target="_blank" rel="noreferrer">
                        sam.gov
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Stack>
  );
}
