import styled from '@emotion/styled';
import { money, type AwardsSummary } from '@sysdesign/contracts';
import { Button, Heading, Stack, Surface, Text } from '@sysdesign/design-system';

const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.space[3]}px;
`;

const Figure = styled.span`
  display: block;
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.primary};
`;

export interface AwardsSummaryTilesProps {
  summary: AwardsSummary;
  /** Spends one request for the awardee's registration; absent means no button. */
  onLookup?: (uei: string) => void;
  /** The UEI whose lookup is in flight. */
  lookingUp?: string | null;
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Surface padding={4}>
      <Text as="span" tone="secondary" size="sm">
        {label}
      </Text>
      <Figure>{children}</Figure>
    </Surface>
  );
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
      <Tiles aria-label="Award summary">
        <Tile label="Awards">{summary.count}</Tile>
        <Tile label="Total obligated">{money(summary.total)}</Tile>
        <Tile label="Median award">{money(summary.median)}</Tile>
        <Tile label="Offers received">
          <Text as="span" size="sm">
            one {offers.one} · few {offers.few} · many {offers.many} · unknown {offers.unknown}
          </Text>
        </Tile>
        <Tile label="Set-asides">
          <Text as="span" size="sm">
            {Object.entries(summary.setAsideMix).length === 0
              ? '—'
              : Object.entries(summary.setAsideMix)
                  .map(([code, count]) => `${code} ${count}`)
                  .join(' · ')}
          </Text>
        </Tile>
        <Tile label="By source">
          <Text as="span" size="sm">
            sam.gov {summary.bySource['sam.gov']} · USAspending {summary.bySource.usaspending}
          </Text>
        </Tile>
      </Tiles>
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
