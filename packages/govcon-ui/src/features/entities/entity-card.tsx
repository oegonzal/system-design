import { day, type Entity } from '@sysdesign/contracts';
import { Alert, Badge, Heading, Stack, Text } from '@sysdesign/design-system';

import { registrationTone } from '../tones';

export interface EntityCardProps {
  entity: Entity;
  /** `2` on a page of its own, `3` inside another panel. */
  headingLevel?: 2 | 3;
}

/** A registrant as a bidder reads it: registered until when, claiming what, small where, excluded or not, and its own website when it registered one. */
export function EntityCard({ entity, headingLevel = 3 }: EntityCardProps) {
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="center" wrap>
        <Heading level={headingLevel}>{entity.legalName}</Heading>
        <Badge tone={registrationTone(entity.registrationStatus)}>
          {entity.registrationStatus ?? 'status unknown'}
        </Badge>
      </Stack>
      {entity.excluded ? (
        <Alert tone="danger" title="Excluded">
          This registrant is on the exclusions list. Do not team with or award to it.
        </Alert>
      ) : null}
      <Text size="sm">
        UEI {entity.uei} · CAGE {entity.cage ?? '—'} · registration expires{' '}
        {day(entity.registrationExpiresAt)} · looked up {day(entity.fetchedAt)}
      </Text>
      {entity.website === null ? null : (
        <Text size="sm">
          Website{' '}
          <a href={entity.website} target="_blank" rel="noreferrer">
            {entity.website}
          </a>
        </Text>
      )}
      <Stack direction="row" gap={2} wrap align="center">
        <Text as="span" tone="secondary" size="sm">
          NAICS
        </Text>
        {entity.naics.length === 0 ? (
          <Text as="span" tone="muted" size="sm">
            none claimed
          </Text>
        ) : (
          entity.naics.map((item) => (
            <Badge key={item.code} tone={item.small === true ? 'success' : 'neutral'}>
              {item.code}
              {item.small === true ? ' small' : item.small === false ? ' other than small' : ''}
            </Badge>
          ))
        )}
      </Stack>
      <Text size="sm">
        Business types {entity.businessTypes.join(', ') || '—'} · SBA certifications{' '}
        {entity.sbaCertifications.join(', ') || 'none'} · PSC {entity.psc.join(', ') || '—'}
      </Text>
    </Stack>
  );
}
