import {
  AWARD_FAMILIES,
  agencyOf,
  clip,
  compactMoney,
  DASH,
  HORIZON_MONTH_CHOICES,
  money,
  monthLabel,
  type HorizonRow,
  type SpendingHorizon,
} from '@sysdesign/contracts';
import {
  Alert,
  Badge,
  ColumnChart,
  SelectField,
  Stack,
  StatGrid,
  StatTile,
  Table,
  Text,
} from '@sysdesign/design-system';

import { Pager } from '../search/pager';
import { AWARD_FAMILY_TONE } from '../tones';
import { AWARD_FAMILY_LABEL } from './costs';

export interface HorizonMonthsProps {
  value: number;
  onChange(months: number): void;
  disabled?: boolean;
}

/** How far ahead to look, from the declared choices. */
export function HorizonMonths({ value, onChange, disabled = false }: HorizonMonthsProps) {
  return (
    <SelectField
      label="Months ahead"
      value={String(value)}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
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

/** How much ends inside the window, per family, and whether the walk saw all of it. */
export function HorizonTiles({ horizon }: HorizonTilesProps) {
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
      </StatGrid>
      {horizon.capped ? (
        <Alert tone="warn">
          {`The walk stopped early (${horizon.stoppedBy ?? 'unknown'}): the list is partial${
            horizon.reachedEndsAt === null
              ? ''
              : `, complete only for awards ending after ${horizon.reachedEndsAt}`
          }.`}
        </Alert>
      ) : null}
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
  offset: number;
  limit: number;
  onPage(offset: number): void;
}

/** The soonest-ending awards, paged on the client — the lens already bounded them. */
export function HorizonTable({ rows, offset, limit, onPage }: HorizonTableProps) {
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
            </tr>
          ))}
        </tbody>
      </Table>
      <Pager offset={offset} limit={limit} total={rows.length} onChange={onPage} />
    </Stack>
  );
}
