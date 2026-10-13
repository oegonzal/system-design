import {
  AWARD_FAMILIES,
  agencyOf,
  clip,
  compactMoney,
  DASH,
  day,
  HORIZON_MONTH_CHOICES,
  money,
  monthLabel,
  type HorizonMonthChoice,
  type HorizonNoticeMatch,
  type HorizonRow,
  type SpendingHorizon,
} from '@sysdesign/contracts';
import {
  Alert,
  Badge,
  ColumnChart,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  SelectField,
  Stack,
  StatGrid,
  StatTile,
  Table,
  Text,
} from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { noticeHref } from '../notice-href';
import { Pager } from '../search/pager';
import { AWARD_FAMILY_TONE } from '../tones';
import { AWARD_FAMILY_LABEL } from './costs';

export interface HorizonMonthsProps {
  value: HorizonMonthChoice;
  onChange(months: HorizonMonthChoice): void;
  disabled?: boolean;
}

/** How far ahead to look, from the declared choices. */
export function HorizonMonths({ value, onChange, disabled = false }: HorizonMonthsProps) {
  return (
    <SelectField
      label="Months ahead"
      value={String(value)}
      disabled={disabled}
      onChange={(event) => {
        const months = HORIZON_MONTH_CHOICES.find(
          (choice) => String(choice) === event.target.value,
        );
        if (months !== undefined) onChange(months);
      }}
    >
      {HORIZON_MONTH_CHOICES.map((months) => (
        <option key={months} value={months}>
          {months}
        </option>
      ))}
    </SelectField>
  );
}

export interface HorizonTilesProps {
  horizon: SpendingHorizon;
}

/** What a capped walk says: how far it got — or that it never reached the window at all, which a wide scope does. */
const cappedMessage = (horizon: SpendingHorizon): string => {
  const stop = horizon.stoppedBy ?? 'unknown';
  if (horizon.rows.length === 0) {
    return `The walk stopped early (${stop}) before it reached the window: every award it read ends after ${horizon.reachedEndsAt ?? 'the window'}. Narrow the scope — one code family, one agency, one award family.`;
  }
  return `The walk stopped early (${stop}): the list is partial${
    horizon.reachedEndsAt === null
      ? ''
      : `, complete only for awards ending after ${horizon.reachedEndsAt}`
  }.`;
};

/** How much ends inside the window, per family, how many rows already have an open notice, and whether the walk saw all of it. */
export function HorizonTiles({ horizon }: HorizonTilesProps) {
  const withNotice = horizon.openNotices.filter((match) => match.notices.length > 0).length;
  return (
    <Stack gap={3}>
      <StatGrid aria-label="Ending inside the window">
        {AWARD_FAMILIES.map((family) => {
          const count = horizon.buckets.reduce((sum, bucket) => sum + bucket[family].count, 0);
          const amount = horizon.buckets.reduce((sum, bucket) => sum + bucket[family].amount, 0);
          return (
            <StatTile
              key={family}
              label={`${AWARD_FAMILY_LABEL[family]} ending`}
              value={count}
              detail={`${compactMoney(amount)} obligated so far on them`}
            />
          );
        })}
        <StatTile
          label="Window"
          value={`${horizon.months} months`}
          detail={`from ${horizon.today}`}
        />
        <StatTile
          label="With an open notice"
          value={withNotice}
          detail={`of ${horizon.rows.length} listed`}
        />
      </StatGrid>
      {horizon.capped ? <Alert tone="warn">{cappedMessage(horizon)}</Alert> : null}
    </Stack>
  );
}

export interface HorizonChartProps {
  horizon: SpendingHorizon;
  pending?: boolean;
}

/** Obligated-so-far on the awards ending each month, contracts and IDVs stacked. */
export function HorizonChart({ horizon, pending = false }: HorizonChartProps) {
  return (
    <ColumnChart
      title="Expiring awards by month"
      summary="Obligations so far on the awards ending in each month of the window, contracts and IDVs stacked."
      series={AWARD_FAMILIES.map((family) => ({ id: family, label: AWARD_FAMILY_LABEL[family] }))}
      data={horizon.buckets.map((bucket) => ({
        label: `${monthLabel(bucket.month)} ${bucket.year}`,
        values: Object.fromEntries(AWARD_FAMILIES.map((family) => [family, bucket[family].amount])),
      }))}
      valueLabel="Obligations so far, USD"
      xLabel="Month"
      formatValue={money}
      formatTick={compactMoney}
      pending={pending}
    />
  );
}

export interface HorizonTableProps {
  rows: readonly HorizonRow[];
  /** The open stored notices joined to the rows by NAICS and buyer; a row with none is absent. */
  openNotices: readonly HorizonNoticeMatch[];
  offset: number;
  limit: number;
  onPage(offset: number): void;
}

/** The open notices of one expiring award, each a link to the notice with its type and deadline. */
function OpenNotices({
  row,
  notices,
}: {
  row: HorizonRow;
  notices: HorizonNoticeMatch['notices'];
}) {
  const Link = useLink();
  if (notices.length === 0) return <>0</>;
  return (
    <Disclosure>
      <DisclosureButton variant="ghost" size="sm">
        {`${notices.length} open`}
      </DisclosureButton>
      <DisclosurePanel>
        <Stack as="ul" gap={1} aria-label={`Open notices for ${row.piid ?? row.externalId}`}>
          {notices.map((notice) => (
            <li key={notice.noticeId}>
              <Link href={noticeHref(notice.noticeId)} $variant="inline">
                {clip(notice.title, 60)}
              </Link>{' '}
              <Text as="span" tone="muted" size="sm">
                {`${notice.noticeType ?? 'notice'} · due ${day(notice.responseDeadlineAt)}`}
              </Text>
            </li>
          ))}
        </Stack>
      </DisclosurePanel>
    </Disclosure>
  );
}

/** The soonest-ending awards, paged on the client — the lens already bounded them — each with the open notices already stored for its work and buyer. */
export function HorizonTable({ rows, openNotices, offset, limit, onPage }: HorizonTableProps) {
  const noticesOf = new Map(openNotices.map((match) => [match.externalId, match.notices]));
  if (rows.length === 0) {
    return (
      <Text tone="muted" size="sm">
        No award in the scope ends inside the window.
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <Table aria-label="Expiring awards">
        <thead>
          <tr>
            <th scope="col">Ends</th>
            <th scope="col">PIID</th>
            <th scope="col">Family</th>
            <th scope="col">Recipient</th>
            <th scope="col">Obligated</th>
            <th scope="col">Agency</th>
            <th scope="col">NAICS / PSC</th>
            <th scope="col">Type</th>
            <th scope="col">Open notices</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(offset, offset + limit).map((row) => (
            <tr key={row.externalId}>
              <td>{row.endsAt}</td>
              <td>{row.piid ?? DASH}</td>
              <td>
                <Badge tone={AWARD_FAMILY_TONE[row.family]}>{AWARD_FAMILY_LABEL[row.family]}</Badge>
              </td>
              <td title={row.description ?? undefined}>{clip(row.recipientName, 40)}</td>
              <td>{money(row.amount)}</td>
              <td>{clip(agencyOf(row.agencyPath), 36)}</td>
              <td>
                {row.naicsCode ?? DASH} / {row.pscCode ?? DASH}
              </td>
              <td>{clip(row.typeDescription, 28)}</td>
              <td>
                <OpenNotices row={row} notices={noticesOf.get(row.externalId) ?? []} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pager offset={offset} limit={limit} total={rows.length} onChange={onPage} />
    </Stack>
  );
}
