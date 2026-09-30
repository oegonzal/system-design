import { day, type Opportunity } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';

export interface NoticeHeaderProps {
  opportunity: Opportunity;
}

/** The notice as one headline: what it is, when, who from, the codes, and the way to sam.gov. */
export function NoticeHeader({ opportunity: o }: NoticeHeaderProps) {
  return (
    <Stack gap={2}>
      <Heading level={1}>{o.title}</Heading>
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
    </Stack>
  );
}
