import { money, type AwardsSummary } from '@sysdesign/contracts';
import { Button, Heading, Stack, StatGrid, StatTile, Text } from '@sysdesign/design-system';

export interface AwardsSummaryTilesProps {
  summary: AwardsSummary;
  /** Spends one request for the awardee's registration; absent means no button. */
  onLookup?: (uei: string) => void;
  /** The UEI whose lookup is in flight. */
  lookingUp?: string | null;
}

/** What the stored awards say, deterministically: how many, for how much, how contested, who keeps winning. */
export function AwardsSummaryTiles({
  summary,
  onLookup,
  lookingUp = null,
}: AwardsSummaryTilesProps) {
  const offers = summary.offers;
  return (
    <Stack gap={4}>
      <StatGrid aria-label="Award summary">
        <StatTile label="Awards" value={summary.count} />
        <StatTile label="Total obligated" value={money(summary.total)} />
        <StatTile label="Median award" value={money(summary.median)} />
        <StatTile
          label="Offers received"
          value={
            <Text as="span" size="sm">
              one {offers.one} · few {offers.few} · many {offers.many} · unknown {offers.unknown}
            </Text>
          }
        />
        <StatTile
          label="Set-asides"
          value={
            <Text as="span" size="sm">
              {Object.entries(summary.setAsideMix).length === 0
                ? '—'
                : Object.entries(summary.setAsideMix)
                    .map(([code, count]) => `${code} ${count}`)
                    .join(' · ')}
            </Text>
          }
        />
        <StatTile
          label="By source"
          value={
            <Text as="span" size="sm">
              sam.gov {summary.bySource['sam.gov']} · USAspending {summary.bySource.usaspending}
            </Text>
          }
        />
      </StatGrid>
      <Stack gap={2}>
        <Heading level={3}>Top awardees</Heading>
        {summary.topAwardees.length === 0 ? (
          <Text tone="muted" size="sm">
            No awardee yet — fetch awards first.
          </Text>
        ) : (
          <Stack as="ul" gap={2}>
            {summary.topAwardees.map((awardee) => (
              <li key={awardee.uei ?? awardee.name}>
                <Stack direction="row" gap={3} align="center" wrap>
                  <Text as="span">
                    {awardee.name} · {awardee.count} award(s) · {money(awardee.total)}
                    {awardee.uei ? ` · ${awardee.uei}` : ''}
                  </Text>
                  {onLookup && awardee.uei ? (
                    <Button
                      type="button"
                      variant="subtle"
                      size="sm"
                      disabled={lookingUp !== null}
                      onClick={() => onLookup(awardee.uei as string)}
                    >
                      {lookingUp === awardee.uei ? 'Looking up…' : 'Look up (1 request)'}
                    </Button>
                  ) : null}
                </Stack>
              </li>
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
