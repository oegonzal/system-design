import {
  compactMoney,
  DASH,
  type AmountRange,
  type PrimeRow,
  type SpendingPrimes,
} from '@sysdesign/contracts';
import {
  Button,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Stack,
  StatGrid,
  StatTile,
  Table,
  Text,
} from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { primeHref } from '../award-href';
import { pipelineHref } from '../pipeline/views';

const count = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

/** A size of subcontract as a person reads it. */
const bandLabel = (band: AmountRange | null): string => {
  if (band === null) return 'of any size';
  if (band.min === null) return `up to ${compactMoney(band.max)}`;
  if (band.max === null) return `of ${compactMoney(band.min)} and up`;
  return `between ${compactMoney(band.min)} and ${compactMoney(band.max)}`;
};

export interface PrimesSummaryProps {
  primes: SpendingPrimes;
}

/**
 * What was read and how far it reached: the source's own count for the
 * scope, the window and the size, the rows read back from the most recent,
 * the repeats removed, and whether older ones were left unread — so a count
 * in the table is never mistaken for the whole.
 */
export function PrimesSummary({ primes }: PrimesSummaryProps) {
  const hired = primes.scope.facets.recipient;
  const unique = primes.read - primes.duplicates;
  return (
    <Stack gap={3}>
      <Text tone="secondary" size="sm">
        {hired.length > 0
          ? `Narrowed to ${hired.join(', ')} as the subcontractor: these are the primes that reported paying it.`
          : 'Who passes work down: the scope’s primes, ranked by the subcontracts they reported.'}{' '}
        {`Subcontracts ${bandLabel(primes.band)}, dated ${primes.from} to ${primes.to}.`}
      </Text>
      <StatGrid aria-label="Subcontracts read">
        <StatTile
          label="Reported in the window"
          value={count.format(primes.total)}
          detail={bandLabel(primes.band)}
        />
        <StatTile
          label="Read, most recent first"
          value={count.format(unique)}
          detail={
            primes.reachedBack === null
              ? 'none'
              : `back to ${primes.reachedBack} · ${count.format(primes.duplicates)} repeat(s) removed`
          }
        />
        <StatTile label="Primes" value={count.format(primes.primeCount)} />
        <StatTile label="Subcontractors" value={count.format(primes.subcontractorCount)} />
      </StatGrid>
      {primes.capped ? (
        <Text tone="muted" size="sm">
          {`The source holds more than was read: subcontracts before ${primes.reachedBack ?? 'the first row'} are not counted here, so a prime’s count is a floor.`}
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * How far the read reached, in one line — for a page about one firm, where
 * the scope's own tiles would read as that firm's.
 */
export function PrimesReadLine({ primes }: PrimesSummaryProps) {
  const unique = count.format(primes.read - primes.duplicates);
  const whole = `subcontracts ${bandLabel(primes.band)} reported in these codes, ${primes.from} to ${primes.to}`;
  return (
    <Text tone="muted" size="sm">
      {primes.capped
        ? `Counted among the ${unique} most recent of ${count.format(primes.total)} ${whole}: those before ${primes.reachedBack ?? 'the first row'} were not read, so a count here is a floor.`
        : `Counted among all ${unique} ${whole}.`}
    </Text>
  );
}

export interface PrimesTableProps {
  rows: readonly PrimeRow[];
  /** How many primes were found in all; the table lists the first. */
  primeCount: number;
  /** Where the primes that hired one subcontractor are ranked. */
  hiredHrefOf(uei: string): string;
  /** The primes already tracked as firms, by UEI. */
  tracked: ReadonlySet<string>;
  /** Track a prime as a firm; offered only for a row the source named by UEI. */
  onTrack(row: PrimeRow): void;
  /** A track is being written; the buttons wait for it. */
  tracking?: boolean;
}

/** The firms a prime reported most often, each a link to who else hires it. */
function TopSubcontractors({
  row,
  hiredHrefOf,
}: {
  row: PrimeRow;
  hiredHrefOf: PrimesTableProps['hiredHrefOf'];
}) {
  const Link = useLink();
  if (row.topSubcontractors.length === 0) return <>{DASH}</>;
  return (
    <Disclosure>
      <DisclosureButton variant="ghost" size="sm">
        {`${row.topSubcontractors.length} most reported`}
      </DisclosureButton>
      <DisclosurePanel>
        <Stack as="ul" gap={1} aria-label={`Firms ${row.name} reported most`}>
          {row.topSubcontractors.map((sub) => (
            <li key={sub.uei ?? sub.name}>
              {sub.uei === null ? (
                sub.name
              ) : (
                <Link
                  href={hiredHrefOf(sub.uei)}
                  $variant="inline"
                  aria-label={`Who hires ${sub.name}`}
                >
                  {sub.name}
                </Link>
              )}{' '}
              <Text as="span" tone="muted" size="sm">
                {`${count.format(sub.subcontracts)} · ${compactMoney(sub.amount)}`}
              </Text>
            </li>
          ))}
        </Stack>
      </DisclosurePanel>
    </Disclosure>
  );
}

/**
 * The primes, most subcontracts first: how many they reported and to how
 * many different firms, the dollars, the share placed under service codes,
 * and what each holds itself in the scope. A prime is its UEI, shown beside
 * its name since one firm may file under several; a prime the source gave
 * one for links to its own page, and one it did not is named and nothing
 * more. The last column says which primes are tracked as firms already and
 * tracks one that is not in one click.
 */
export function PrimesTable({
  rows,
  primeCount,
  hiredHrefOf,
  tracked,
  onTrack,
  tracking = false,
}: PrimesTableProps) {
  const Link = useLink();
  if (rows.length === 0) {
    return (
      <Text tone="muted" size="sm">
        No subcontract was reported for this scope, window and size.
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <Table aria-label="Primes">
        <thead>
          <tr>
            <th scope="col">Prime</th>
            <th scope="col">UEI</th>
            <th scope="col">Subcontracts</th>
            <th scope="col">Different firms</th>
            <th scope="col">Dollars</th>
            <th scope="col">Under service codes</th>
            <th scope="col">Holds in scope</th>
            <th scope="col">Hires</th>
            <th scope="col">Tracking</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.uei ?? row.name}>
              <th scope="row">
                {row.uei === null ? (
                  row.name
                ) : (
                  <Link href={primeHref(row.uei)} $variant="inline">
                    {row.name}
                  </Link>
                )}
              </th>
              <td>{row.uei ?? DASH}</td>
              <td>{count.format(row.subcontracts)}</td>
              <td>{count.format(row.subcontractors)}</td>
              <td>{compactMoney(row.amount)}</td>
              <td>{percent.format(row.serviceShare)}</td>
              <td>{compactMoney(row.obligations)}</td>
              <td>
                <TopSubcontractors row={row} hiredHrefOf={hiredHrefOf} />
              </td>
              <td>
                {row.uei === null ? (
                  DASH
                ) : tracked.has(row.uei) ? (
                  <Link href={pipelineHref('targets')} $variant="inline">
                    Tracked
                  </Link>
                ) : (
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={tracking}
                    onClick={() => onTrack(row)}
                    aria-label={`Track ${row.name}`}
                  >
                    Track
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {primeCount > rows.length ? (
        <Text tone="muted" size="sm">
          {`The first ${count.format(rows.length)} of ${count.format(primeCount)} primes.`}
        </Text>
      ) : null}
      <Text tone="muted" size="sm">
        A count shows that a prime uses outside firms, not that it has an opening. A prime is one
        UEI: a firm that files under several is a row for each. “Holds in scope” is what that UEI
        was obligated as a prime over the same window, and is blank for one that is not among the
        largest recipients.
      </Text>
    </Stack>
  );
}

export interface PrimeRecordProps {
  /** The firm whose record this is. */
  uei: string;
  /** The primes the ranking lists, among which the firm is looked for. */
  rows: readonly PrimeRow[];
  hiredHrefOf(uei: string): string;
}

/**
 * One firm's own row of the ranking, opened out: what it reported and the
 * firms it reported most. A firm the ranking does not list reported fewer
 * than the last one it does — the ranking is bounded, and says so here.
 */
export function PrimeRecord({ uei, rows, hiredHrefOf }: PrimeRecordProps) {
  const Link = useLink();
  const row = rows.find((candidate) => candidate.uei === uei);
  if (row === undefined) {
    const fewest = rows.at(-1)?.subcontracts;
    return (
      <Text tone="muted" size="sm">
        {fewest === undefined
          ? 'No subcontract was reported for this scope, window and size.'
          : `This firm is not among the ${count.format(rows.length)} primes that reported the most: among the rows read it reported fewer than ${count.format(fewest)}, or none.`}
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <StatGrid aria-label="This firm’s subcontracts">
        <StatTile label="Subcontracts reported" value={count.format(row.subcontracts)} />
        <StatTile label="Different firms" value={count.format(row.subcontractors)} />
        <StatTile label="Dollars" value={compactMoney(row.amount)} />
        <StatTile label="Under service codes" value={percent.format(row.serviceShare)} />
      </StatGrid>
      <Table aria-label="Firms it reported most">
        <thead>
          <tr>
            <th scope="col">Subcontractor</th>
            <th scope="col">Subcontracts</th>
            <th scope="col">Dollars</th>
          </tr>
        </thead>
        <tbody>
          {row.topSubcontractors.map((sub) => (
            <tr key={sub.uei ?? sub.name}>
              <th scope="row">
                {sub.uei === null ? (
                  sub.name
                ) : (
                  <Link
                    href={hiredHrefOf(sub.uei)}
                    $variant="inline"
                    aria-label={`Who hires ${sub.name}`}
                  >
                    {sub.name}
                  </Link>
                )}
              </th>
              <td>{count.format(sub.subcontracts)}</td>
              <td>{compactMoney(sub.amount)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Stack>
  );
}
