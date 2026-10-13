import {
  AWARD_SIZE_BANDS,
  compactMoney,
  type ReachCut,
  type SpendingReach,
} from '@sysdesign/contracts';
import { BarList, Stack, Table, Text } from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { REACH_CUT_LABEL } from './costs';
import { PublicationNote } from './publication-note';

const count = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

/** One figure over another as a share, or a dash when there is nothing to divide by. */
const shareOf = (part: number, whole: number): string =>
  whole > 0 ? percent.format(part / whole) : '—';

export interface ReachFunnelProps {
  reach: SpendingReach;
  /** Where a cut's own awards are ranked by who won them; null for a cut with nothing to show. */
  hrefOf(cut: ReachCut): string | null;
}

/**
 * The scope's new contracts cut down step by step to the ones a firm with
 * these lanes could have won as it stands, each cut a share of the first
 * and a link to who won it; then the last cut by award size, against the
 * acquisition thresholds that decide how such a purchase is made.
 */
export function ReachFunnel({ reach, hrefOf }: ReachFunnelProps) {
  const Link = useLink();
  const whole = reach.cuts[0]?.awards ?? 0;
  const last = reach.cuts.at(-1);
  return (
    <Stack gap={4}>
      <Text tone="secondary" size="sm">
        {`New contracts from ${reach.from} to ${reach.to}, cut down step by step. Contracts only: a vehicle is not work until an order is placed under it.`}
      </Text>
      <Table aria-label="Reach">
        <thead>
          <tr>
            <th scope="col">Cut</th>
            <th scope="col">Contracts</th>
            <th scope="col">Of new</th>
            <th scope="col">Obligated</th>
            <th scope="col">Who won them</th>
          </tr>
        </thead>
        <tbody>
          {reach.cuts.map((cut) => {
            const { label, note } = REACH_CUT_LABEL[cut.id];
            const href = hrefOf(cut);
            return (
              <tr key={cut.id}>
                <th scope="row">
                  {label}
                  <Text tone="muted" size="sm">
                    {note}
                  </Text>
                </th>
                <td>{count.format(cut.awards)}</td>
                <td>{shareOf(cut.awards, whole)}</td>
                <td>{compactMoney(cut.amount)}</td>
                <td>
                  {href === null ? (
                    '—'
                  ) : (
                    <Link href={href} $variant="inline" aria-label={`Who won: ${label}`}>
                      Rank them
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Text tone="muted" size="sm">
        {reach.lanes.length === 0
          ? 'No lanes were named, so every lane is counted.'
          : `Lanes counted: ${reach.lanes.join(', ')}.`}
      </Text>
      <BarList
        title={`${last === undefined ? 'The last cut' : REACH_CUT_LABEL[last.id].label} by award size`}
        items={reach.bands.map((band) => {
          const declared = AWARD_SIZE_BANDS.find((item) => item.id === band.id);
          return {
            id: band.id,
            label: declared?.label ?? band.id,
            detail: declared?.note,
            value: band.awards,
            share: last !== undefined && last.awards > 0 ? band.awards / last.awards : null,
          };
        })}
        formatValue={(value) => count.format(value)}
        emptyMessage="Nothing to cut by size."
      />
      <PublicationNote
        delay={reach.delay}
        consequence="This window reaches past that day, so every count here is short by those awards."
      />
    </Stack>
  );
}
