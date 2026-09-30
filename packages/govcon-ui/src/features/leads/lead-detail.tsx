import styled from '@emotion/styled';
import { day, type LeadTier, type NoticeDto } from '@sysdesign/contracts';
import {
  Badge,
  Button,
  Heading,
  Meter,
  Stack,
  Table,
  Text,
  type MeterTone,
} from '@sysdesign/design-system';

import { TIER_TONE } from '../tones';

const Pre = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.space[4]}px;
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text.primary};
  background: ${({ theme }) => theme.color.bg.subtle};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

const SCORE_TONE: Record<LeadTier, MeterTone> = { high: 'success', medium: 'warn', low: 'danger' };

export interface LeadDetailProps {
  lead: NoticeDto;
  onFetchDescription(): void;
  /** While the description request is in flight. */
  fetching?: boolean;
  /** Why the last fetch brought no text — the budget, or a failure. */
  problem?: string | null;
}

/** One notice in full: the facts, who to ask, the score with every point traced, and the description once fetched. */
export function LeadDetail({
  lead,
  onFetchDescription,
  fetching = false,
  problem = null,
}: LeadDetailProps) {
  const o = lead.opportunity;
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Heading level={2}>{o.title}</Heading>
        <Text tone="secondary" size="sm">
          {o.noticeType ?? 'type unknown'} · posted {day(o.postedAt)} · deadline{' '}
          {day(o.responseDeadlineAt)} ·{' '}
          {o.active === null ? 'activity unknown' : o.active ? 'active' : 'inactive'}
        </Text>
        <Text size="sm">{o.agencyPath ?? '—'}</Text>
        <Stack direction="row" gap={2} wrap align="center">
          {o.naicsCodes.map((code) => (
            <Badge key={code}>naics {code}</Badge>
          ))}
          {o.classificationCode && <Badge>psc {o.classificationCode}</Badge>}
          <Badge tone={o.setAsideCode ? 'accent' : 'neutral'}>
            {o.setAsideCode ? `set-aside ${o.setAsideCode}` : 'open competition'}
          </Badge>
        </Stack>
        <Text size="sm">
          Solicitation {o.solicitationNumber ?? '—'} ·{' '}
          {o.uiLink ? (
            <a href={o.uiLink} target="_blank" rel="noreferrer">
              open on sam.gov
            </a>
          ) : (
            'no link'
          )}
        </Text>
        <Text size="sm">
          {o.pointsOfContact.length > 0
            ? `Contact: ${o.pointsOfContact
                .map((c) => [c.fullName, c.email, c.phone].filter(Boolean).join(' · '))
                .join(' / ')}`
            : 'Contact: —'}
        </Text>
      </Stack>

      <Stack gap={2}>
        {lead.excluded ? (
          <Text tone="secondary">
            Excluded by {lead.excluded.factor}: {lead.excluded.reason}
          </Text>
        ) : (
          <Meter
            label={`Score ${lead.score.toFixed(1)} · ${lead.tier ?? 'unranked'}`}
            value={lead.score}
            tone={lead.tier ? SCORE_TONE[lead.tier] : 'danger'}
          />
        )}
        {lead.tier && <Badge tone={TIER_TONE[lead.tier]}>{lead.tier}</Badge>}
        <Table aria-label="Factor trace">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Value</th>
              <th>Weight</th>
              <th>Points</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {lead.factors.map((factor) => (
              <tr key={factor.id}>
                <td>{factor.id}</td>
                <td>{factor.value.toFixed(2)}</td>
                <td>{factor.weight.toFixed(2)}</td>
                <td>{factor.points.toFixed(1)}</td>
                <td>{factor.evidence.join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Stack>

      <Stack gap={2}>
        <Heading level={3}>Description</Heading>
        {lead.description ? (
          <>
            <Text tone="muted" size="sm">
              Fetched {day(lead.description.fetchedAt)} — stored, no further request.
            </Text>
            <Pre aria-label="Description text">{lead.description.text}</Pre>
          </>
        ) : (
          <>
            <Text tone="secondary" size="sm">
              Not fetched yet. Fetching spends one request; the text is then kept.
            </Text>
            <Stack direction="row" gap={3} align="center" wrap>
              <Button variant="solid" size="sm" onClick={onFetchDescription} disabled={fetching}>
                {fetching ? 'Fetching…' : 'Fetch description'}
              </Button>
              {problem && (
                <Text tone="secondary" size="sm">
                  {problem}
                </Text>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Stack>
  );
}
