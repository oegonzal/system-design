import { compactMoney, money, periodMonthLabel, type SpendingPulse } from '@sysdesign/contracts';
import { ColumnChart, StatGrid, StatTile, Text } from '@sysdesign/design-system';

import { periodColumns, pulseYears } from './period-columns';
import type { PulseFigures, Range } from './pulse-figures';

const percentChange = (now: number, then: number | null): string | null =>
  then === null || then === 0
    ? null
    : `${now >= then ? '+' : ''}${(((now - then) / then) * 100).toFixed(0)}% vs the prior year to date`;

const rangeLabel = (range: Range): string =>
  `${compactMoney(range.low)}–${compactMoney(range.high)}`;

export interface PulseTilesProps {
  figures: PulseFigures;
}

/** The year so far against last year, and what the projection adds. */
export function PulseTiles({ figures }: PulseTilesProps) {
  const through = `FY${figures.fiscalYear} through ${periodMonthLabel(figures.throughPeriod)}`;
  return (
    <StatGrid aria-label="Fiscal year to date">
      <StatTile label="Year to date" value={compactMoney(figures.toDate)} detail={through} />
      <StatTile
        label="Prior year to date"
        value={compactMoney(figures.priorToDate)}
        detail={
          percentChange(figures.toDate, figures.priorToDate) ??
          `FY${figures.fiscalYear - 1} through ${periodMonthLabel(figures.throughPeriod)}`
        }
      />
      <StatTile
        label="Projected remainder"
        value={figures.remainder === null ? '—' : compactMoney(figures.remainder.amount)}
        detail={
          figures.remainder === null
            ? 'No complete prior year to project from'
            : rangeLabel(figures.remainder)
        }
      />
      <StatTile
        label="Projected year"
        value={figures.projectedTotal === null ? '—' : compactMoney(figures.projectedTotal.amount)}
        detail={
          figures.projectedTotal === null
            ? figures.priorTotal === null
              ? undefined
              : `Prior year ${compactMoney(figures.priorTotal)}`
            : rangeLabel(figures.projectedTotal)
        }
      />
    </StatGrid>
  );
}

export interface PulseChartProps {
  pulse: SpendingPulse;
  pending?: boolean;
}

/** Obligations by fiscal period, one series per year; this year's open months hatched with their band. */
export function PulseChart({ pulse, pending = false }: PulseChartProps) {
  const { series, data } = periodColumns(pulseYears(pulse));
  const method = pulse.projection;
  return (
    <>
      <ColumnChart
        title="Obligations by fiscal period"
        summary={`Obligations by fiscal period for FY${series.map((item) => item.label.slice(2)).join(', FY')}, newest first; this year's remaining periods are projected.`}
        layout="grouped"
        series={series}
        data={data}
        valueLabel="Obligations, USD"
        xLabel="Period"
        formatValue={money}
        formatTick={compactMoney}
        pending={pending}
      />
      <Text tone="muted" size="sm">
        {method === null
          ? 'No projection: the source has no complete prior fiscal year for this scope.'
          : `Projection: the ${method.method} of FY${method.lookbackFiscalYears.join(', FY')}${
              method.ratio === null
                ? `, unscaled until ${method.basePeriods === 0 ? 'a' : 'another'} complete period is in`
                : `, scaled ${method.ratio.toFixed(2)}× by ${method.basePeriods} complete period(s) of this year`
            }.`}
      </Text>
    </>
  );
}
