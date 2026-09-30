import type { Opportunity, OpportunityOffice, OpportunityPlace } from '@sysdesign/contracts';
import { Heading, Stack, Text } from '@sysdesign/design-system';

export interface NoticeFactsProps {
  opportunity: Opportunity;
}

const placeLine = (place: OpportunityPlace | null): string =>
  place === null
    ? 'not stated'
    : [place.city, place.state, place.zip, place.country].filter(Boolean).join(', ') ||
      'not stated';

const officeLine = (office: OpportunityOffice | null): string =>
  office === null
    ? 'not stated'
    : [office.city, office.state, office.zip, office.countryCode].filter(Boolean).join(', ') ||
      'not stated';

/** Where the work is, who buys it, and who to ask — each contact with the role SAM.gov gave it. */
export function NoticeFacts({ opportunity: o }: NoticeFactsProps) {
  return (
    <Stack gap={2}>
      <Heading level={3}>Facts</Heading>
      <Text size="sm">Place of performance: {placeLine(o.placeOfPerformance)}</Text>
      <Text size="sm">Contracting office: {officeLine(o.officeAddress)}</Text>
      {o.pointsOfContact.length === 0 ? (
        <Text size="sm" tone="muted">
          No point of contact listed.
        </Text>
      ) : (
        <Stack as="ul" gap={1} aria-label="Contacts">
          {o.pointsOfContact.map((contact, index) => (
            <li key={`${contact.email ?? contact.fullName ?? index}`}>
              <Text as="span" size="sm">
                {contact.type ?? 'contact'}: {contact.fullName ?? '—'}
                {contact.title ? ` (${contact.title})` : ''}
                {contact.email ? ` · ${contact.email}` : ''}
                {contact.phone ? ` · ${contact.phone}` : ''}
              </Text>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
