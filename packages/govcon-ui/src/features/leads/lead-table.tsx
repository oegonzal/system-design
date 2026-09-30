import styled from '@emotion/styled';
import { agencyOf, clip, day, type LeadsReport } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { TIER_TONE } from '../tones';

const RowButton = styled.button`
  all: unset;
  cursor: pointer;
  color: ${({ theme }) => theme.color.accent.default};
  text-decoration: underline;

  &[aria-current='true'] {
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    text-decoration: none;
    color: ${({ theme }) => theme.color.text.primary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

export interface LeadTableProps {
  report: LeadsReport;
  activeNoticeId: string | null;
  onSelect(noticeId: string): void;
}

/** The ranking as the service returned it; the title opens the lead, the link opens sam.gov. */
export function LeadTable({ report, activeNoticeId, onSelect }: LeadTableProps) {
  return (
    <Stack gap={3}>
      <Heading level={2}>Leads</Heading>
      <Text tone="secondary" size="sm">
        {report.candidates} candidate(s) · {report.excluded} excluded by a gate · {report.matching}{' '}
        over the filters · {report.leads.length} shown
      </Text>
      {report.leads.length === 0 ? (
        <Text tone="muted" size="sm">
          No leads — pull first, or lower the minimum score.
        </Text>
      ) : (
        <Table aria-label="Leads">
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
              return (
                <tr key={o.noticeId}>
                  <td>{index + 1}</td>
                  <td>{lead.score.toFixed(1)}</td>
                  <td>
                    {lead.tier ? <Badge tone={TIER_TONE[lead.tier]}>{lead.tier}</Badge> : '—'}
                  </td>
                  <td>{day(o.responseDeadlineAt)}</td>
                  <td>{o.setAsideCode ?? 'open'}</td>
                  <td>{o.naicsCode ?? '—'}</td>
                  <td>{clip(agencyOf(o.agencyPath), 36)}</td>
                  <td>
                    <RowButton
                      type="button"
                      aria-current={o.noticeId === activeNoticeId}
                      onClick={() => onSelect(o.noticeId)}
                    >
                      {clip(o.title, 70)}
                    </RowButton>
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
