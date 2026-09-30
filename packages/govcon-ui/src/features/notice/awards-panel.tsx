import { day, money, type Award, type Entity, type NoticeAwards } from '@sysdesign/contracts';
import { Alert, Badge, Button, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { EntityCard } from '../entities/entity-card';
import { AWARD_SOURCE_TONE } from '../tones';

export interface AwardsPanelProps {
  awards: NoticeAwards;
  /** Registrants already looked up, by UEI. */
  entities: Readonly<Record<string, Entity>>;
  onLookup(uei: string): void;
  /** The UEI whose lookup is in flight. */
  lookingUp?: string | null;
  lookupError?: string | null;
}

/** The offers-received bands, in the order a bidder reads competition. */
const OFFER_BANDS = [
  ['one', 'one offer'],
  ['few', '2–4 offers'],
  ['many', '5+ offers'],
  ['unknown', 'unknown'],
] as const;

const offersLabel = (offers: number | null): string => (offers === null ? '—' : String(offers));

/**
 * What the stored awards say: the awards of this very solicitation, then the
 * summary of its NAICS in the profile's history window, then any awardee
 * looked up — one request each, and only on a click.
 */
export function AwardsPanel({
  awards,
  entities,
  onLookup,
  lookingUp = null,
  lookupError = null,
}: AwardsPanelProps) {
  const { bySolicitation, related } = awards;
  const lookedUp = bySolicitation
    .map((award) => award.awardeeUei)
    .filter((uei): uei is string => uei !== null && uei in entities);
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Heading level={3}>Awards on this solicitation</Heading>
        {bySolicitation.length === 0 ? (
          <Text size="sm" tone="muted">
            None stored. Intel › Awards fetches the award history for a NAICS or PSC.
          </Text>
        ) : (
          <Table aria-label="Awards on this solicitation">
            <thead>
              <tr>
                <th>Source</th>
                <th>Awardee</th>
                <th>Amount</th>
                <th>Offers</th>
                <th>Set-aside</th>
                <th>Signed</th>
                <th>Registrant</th>
              </tr>
            </thead>
            <tbody>
              {bySolicitation.map((award: Award) => (
                <tr key={`${award.source}:${award.externalId}`}>
                  <td>
                    <Badge tone={AWARD_SOURCE_TONE[award.source]}>{award.source}</Badge>
                  </td>
                  <td>{award.awardeeName ?? '—'}</td>
                  <td>{money(award.amount)}</td>
                  <td>{offersLabel(award.offersReceived)}</td>
                  <td>{award.setAsideCode ?? 'open'}</td>
                  <td>{day(award.signedAt)}</td>
                  <td>
                    {award.awardeeUei === null ? (
                      '—'
                    ) : award.awardeeUei in entities ? (
                      'looked up'
                    ) : (
                      <Button
                        variant="subtle"
                        size="sm"
                        disabled={lookingUp !== null}
                        onClick={() => onLookup(award.awardeeUei ?? '')}
                      >
                        {lookingUp === award.awardeeUei
                          ? 'Looking up…'
                          : 'Look up awardee (1 request)'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {lookupError && <Alert tone="danger">{lookupError}</Alert>}
      </Stack>

      <Stack gap={2}>
        <Heading level={3}>Same NAICS, recent awards</Heading>
        {related.count === 0 ? (
          <Text size="sm" tone="muted">
            No stored award in this NAICS inside the profile&apos;s history window.
          </Text>
        ) : (
          <Stack as="ul" gap={1} aria-label="Related awards summary">
            <li>
              <Text as="span" size="sm">
                {related.count} award(s) · {money(related.total)} in all · median{' '}
                {money(related.median)}
              </Text>
            </li>
            <li>
              <Text as="span" size="sm">
                Competition:{' '}
                {OFFER_BANDS.map(([band, label]) => `${label} ${related.offers[band]}`).join(' · ')}
              </Text>
            </li>
            <li>
              <Text as="span" size="sm">
                Set-asides:{' '}
                {Object.entries(related.setAsideMix)
                  .map(([code, count]) => `${code} ${count}`)
                  .join(' · ') || '—'}
              </Text>
            </li>
            <li>
              <Text as="span" size="sm">
                Winning most:{' '}
                {related.topAwardees
                  .map((share) => `${share.name} (${share.count}, ${money(share.total)})`)
                  .join(' · ') || '—'}
              </Text>
            </li>
          </Stack>
        )}
      </Stack>

      {lookedUp.map((uei) => {
        const entity = entities[uei];
        return entity ? <EntityCard key={uei} entity={entity} /> : null;
      })}
    </Stack>
  );
}
