import { compactMoney, type SpendingReach } from '@sysdesign/contracts';
import { Heading, Stack, StatGrid, StatTile, Text } from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { REACH_CUT_LABEL } from '../spending/costs';
import { ProvenanceLine } from '../spending/provenance-line';

const count = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

export interface ReachTilesProps {
  reach: SpendingReach;
  /** The Reach lens over the same scope, where every cut is ranked by who won it. */
  href: string;
}

/**
 * How much of the year's new work in the profile's codes was within reach,
 * as one tile per cut — each a share of the new contracts and what was
 * obligated on them — and a link to the lens that ranks who won each.
 */
export function ReachTiles({ reach, href }: ReachTilesProps) {
  const Link = useLink();
  const whole = reach.cuts[0]?.awards ?? 0;
  return (
    <Stack gap={3}>
      <Heading level={2}>Within reach</Heading>
      <Text tone="secondary" size="sm">
        {`New contracts in your codes from ${reach.from} to ${reach.to}, cut down to the ones a firm in your lanes could have won as it stands.`}
      </Text>
      <StatGrid aria-label="Reach by cut">
        {reach.cuts.map((cut) => (
          <StatTile
            key={cut.id}
            label={REACH_CUT_LABEL[cut.id].label}
            value={count.format(cut.awards)}
            detail={`${whole > 0 ? percent.format(cut.awards / whole) : '—'} of new · ${compactMoney(cut.amount)}`}
          />
        ))}
      </StatGrid>
      <Link href={href} $variant="inline">
        Who won each cut, on the Reach lens
      </Link>
      <ProvenanceLine provenance={reach.provenance} />
    </Stack>
  );
}
