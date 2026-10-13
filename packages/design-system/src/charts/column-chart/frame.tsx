import styled from '@emotion/styled';
import type { ReactNode } from 'react';

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '../../primitives/disclosure/disclosure';
import { Table } from '../../primitives/table/table';
import { Text } from '../../primitives/text/text';
import { transient } from '../../theme/styled';
import { cellOf, type ColumnDatum, type ColumnSeries } from './geometry';

const DASH = '—';

const Figure = styled.figure`
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
`;

const Legend = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => `${theme.space[2]}px ${theme.space[5]}px`};
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.text.secondary};
`;

const LegendItem = styled.li`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

/** The identity swatch beside a series name; hatched when the series carries a projection. */
const Swatch = styled('span', transient)<{ $color: string; $hatched: boolean }>`
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: ${({ $color, $hatched }) =>
    $hatched ? `repeating-linear-gradient(45deg, ${$color} 0 2px, transparent 2px 4px)` : $color};
  box-shadow: ${({ $color, $hatched }) => ($hatched ? `inset 0 0 0 1px ${$color}` : 'none')};
`;

export interface ChartFrameProps {
  title: string;
  series: readonly ColumnSeries[];
  data: readonly ColumnDatum[];
  colors: readonly string[];
  valueLabel: string;
  xLabel: string;
  formatValue: (value: number) => string;
  pending: boolean;
  children: ReactNode;
}

/** How one cell reads in the table: the value, then what kind of value it is. */
export function describeCell(
  datum: ColumnDatum,
  id: string,
  formatValue: (value: number) => string,
): string {
  const value = datum.values[id];
  if (value === undefined) return DASH;
  const cell = cellOf(value);
  const notes = [
    cell.projected ? '(projected)' : null,
    cell.provisional ? '(provisional)' : null,
    cell.band ? `· ${formatValue(cell.band.low)}–${formatValue(cell.band.high)}` : null,
  ].filter((note): note is string => note !== null);
  return [formatValue(cell.value), ...notes].join(' ');
}

const hasProjection = (data: readonly ColumnDatum[], id: string): boolean =>
  data.some((datum) => {
    const value = datum.values[id];
    return value !== undefined && cellOf(value).projected === true;
  });

/**
 * What surrounds the plot: a legend when there are two or more series (one
 * series is named by the title alone), the plot itself, and the data table
 * twin under a disclosure — the same numbers as text, so nothing in the
 * chart is gated behind sight or hover. While pending the figure says it is
 * busy; the plot dims its marks and leaves every word at full contrast.
 */
export function ChartFrame({
  title,
  series,
  data,
  colors,
  valueLabel,
  xLabel,
  formatValue,
  pending,
  children,
}: ChartFrameProps) {
  return (
    <Figure aria-busy={pending || undefined}>
      {series.length > 1 ? (
        <Legend aria-label={`${title} legend`}>
          {series.map((item, index) => (
            <LegendItem key={item.id}>
              <Swatch
                $color={colors[index] ?? 'currentColor'}
                $hatched={hasProjection(data, item.id)}
                aria-hidden="true"
              />
              {item.label}
            </LegendItem>
          ))}
        </Legend>
      ) : null}
      {children}
      <Disclosure>
        <DisclosureButton variant="ghost" size="sm">
          Data table
        </DisclosureButton>
        <DisclosurePanel>
          <Table aria-label={`${title} table`}>
            <thead>
              <tr>
                <th scope="col">{xLabel}</th>
                {series.map((item) => (
                  <th key={item.id} scope="col">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((datum) => (
                <tr key={datum.label}>
                  <th scope="row">{datum.label}</th>
                  {series.map((item) => (
                    <td key={item.id}>{describeCell(datum, item.id, formatValue)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
          <Text tone="muted" size="sm">
            {valueLabel}
          </Text>
        </DisclosurePanel>
      </Disclosure>
    </Figure>
  );
}
