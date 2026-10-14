import {
  clip,
  compactMoney,
  DASH,
  type IncumbentGap,
  type NoticeIncumbents,
} from '@sysdesign/contracts';
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  Heading,
  Stack,
  Table,
  Text,
} from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { awardHref, primeHref } from '../award-href';
import { AWARD_FAMILY_LABEL } from '../spending/costs';
import { ProvenanceLine } from '../spending/provenance-line';
import { AWARD_FAMILY_TONE } from '../tones';

/** Why nothing could be read, in the notice's own terms. */
const GAP_COPY: Record<IncumbentGap, string> = {
  naics:
    'This notice names no NAICS code the award data takes, so there is no work to match awards to.',
  buyer:
    'This notice does not name its buyer down to the sub-agency, so its awards cannot be told from the rest of the department’s.',
};

export interface IncumbentsPanelProps {
  /** The notice's own product service code, when it has one: what the narrowing narrows to. */
  noticePsc: string | null;
  /** Null until asked for. */
  incumbents: NoticeIncumbents | null;
  samePsc: boolean;
  onSamePscChange(next: boolean): void;
  onAsk(): void;
  loading?: boolean;
  error?: string | null;
}

/**
 * Who may hold the work a notice is about: the awards in its code at its
 * own sub-agency that end in the coming months, each a link to its own
 * record, where the vehicle, the offers and the set-aside are. Asked for,
 * never read by itself, since it asks the award source; the notice's
 * product service code narrows it unless unticked. Candidates, and the
 * panel says so — and how far the list is complete.
 */
export function IncumbentsPanel({
  noticePsc,
  incumbents,
  samePsc,
  onSamePscChange,
  onAsk,
  loading = false,
  error = null,
}: IncumbentsPanelProps) {
  const Link = useLink();
  return (
    <Stack gap={3}>
      <Heading level={2}>Who holds this work</Heading>
      <Text tone="secondary" size="sm">
        Awards in this notice’s NAICS code at the same sub-agency that end in the coming months:
        candidates for the work it replaces, not a confirmed match. Each opens its own record.
      </Text>
      <Stack direction="row" gap={4} align="center" wrap>
        <Button type="button" variant="subtle" size="sm" disabled={loading} onClick={onAsk}>
          {loading
            ? 'Reading the awards…'
            : incumbents === null
              ? 'Look for awards ending at this buyer — free'
              : 'Read again — free'}
        </Button>
        {noticePsc === null ? null : (
          <CheckboxField
            label={`Only under PSC ${noticePsc}`}
            checked={samePsc}
            disabled={loading}
            onChange={(event) => onSamePscChange(event.target.checked)}
          />
        )}
      </Stack>
      {noticePsc === null || samePsc ? null : (
        <Text tone="muted" size="sm">
          Without the product service code every award in the NAICS code is walked: many more
          requests, and a list complete only for the nearest months.
        </Text>
      )}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {incumbents === null ? null : incumbents.gap !== null ? (
        <Text tone="muted" size="sm">
          {GAP_COPY[incumbents.gap]}
        </Text>
      ) : (
        <>
          <Text tone="secondary" size="sm">
            {`${incumbents.rows.length} of the ${incumbents.listed} award(s) the scope lists ending within ${incumbents.months} months of ${incumbents.today} are at this buyer.`}
          </Text>
          {incumbents.capped ? (
            <Alert tone="warn">
              {incumbents.completeBefore === null
                ? 'The scope is too wide to place today among its awards: no month is complete. Narrow it to the product service code.'
                : `The list is complete only for awards ending before ${incumbents.completeBefore}; later ones may be missing. Narrow it to the product service code to reach further.`}
            </Alert>
          ) : null}
          {incumbents.rows.length === 0 ? null : (
            <Table aria-label="Awards that may hold this work">
              <thead>
                <tr>
                  <th scope="col">Ends</th>
                  <th scope="col">Award</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Holder</th>
                  <th scope="col">Obligated</th>
                  <th scope="col">PSC</th>
                  <th scope="col">Type</th>
                </tr>
              </thead>
              <tbody>
                {incumbents.rows.map((row) => (
                  <tr key={row.externalId}>
                    <td>{row.endsAt}</td>
                    <th scope="row">
                      <Link href={awardHref(row.externalId)} $variant="inline">
                        {row.piid ?? row.externalId}
                      </Link>
                    </th>
                    <td>
                      <Badge tone={AWARD_FAMILY_TONE[row.family]}>
                        {AWARD_FAMILY_LABEL[row.family]}
                      </Badge>
                    </td>
                    <td title={row.description ?? undefined}>
                      {row.recipientUei === null ? (
                        clip(row.recipientName, 40)
                      ) : (
                        <Link href={primeHref(row.recipientUei)} $variant="inline">
                          {clip(row.recipientName, 40)}
                        </Link>
                      )}
                    </td>
                    <td>{compactMoney(row.amount)}</td>
                    <td>{row.pscCode ?? DASH}</td>
                    <td>{clip(row.typeDescription, 28)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {incumbents.provenance === null ? null : (
            <ProvenanceLine provenance={incumbents.provenance} />
          )}
        </>
      )}
    </Stack>
  );
}
