import { agencyOf, type Award, clip, money, rangeLabel } from '@sysdesign/contracts';
import { Badge, Button, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { AWARD_SOURCE_TONE } from '../tones';

export interface AwardTableProps {
  awards: readonly Award[];
  total: number;
  limit: number;
  offset: number;
  onPage?: (offset: number) => void;
}

/** The stored awards over the filters, newest signed first, one page at a time. */
export function AwardTable({ awards, total, limit, offset, onPage }: AwardTableProps) {
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={4} align="center" wrap justify="between">
        <Heading level={3}>Awards</Heading>
        <Text tone="secondary" size="sm">
          {total === 0
            ? 'none stored over these filters'
            : rangeLabel(offset, awards.length, total)}
        </Text>
      </Stack>
      {awards.length === 0 ? (
        <Text tone="muted" size="sm">
          No awards here — widen the filters, or fetch some.
        </Text>
      ) : (
        <Table aria-label="Awards">
          <thead>
            <tr>
              <th>Signed</th>
              <th>PIID</th>
              <th>Awardee</th>
              <th>Amount</th>
              <th>Offers</th>
              <th>Set-aside</th>
              <th>NAICS / PSC</th>
              <th>Agency</th>
              <th>Solicitation</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {awards.map((award) => (
              <tr key={`${award.source}:${award.externalId}`}>
                <td>{award.signedAt}</td>
                <td>{award.piid ?? '—'}</td>
                <td>{clip(award.awardeeName, 40)}</td>
                <td>{money(award.amount)}</td>
                <td>{award.offersReceived ?? '—'}</td>
                <td>{award.setAsideCode ?? 'open'}</td>
                <td>
                  {award.naicsCode ?? '—'} / {award.pscCode ?? '—'}
                </td>
                <td>{clip(agencyOf(award.agencyPath), 36)}</td>
                <td>{award.solicitationNumber ?? '—'}</td>
                <td>
                  <Badge tone={AWARD_SOURCE_TONE[award.source]}>{award.source}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {onPage && total > limit ? (
        <Stack direction="row" gap={3} align="center">
          <Button
            type="button"
            variant="subtle"
            size="sm"
            disabled={offset === 0}
            onClick={() => onPage(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="subtle"
            size="sm"
            disabled={offset + awards.length >= total}
            onClick={() => onPage(offset + limit)}
          >
            Next
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
