import { useTheme } from '@emotion/react';
import { useId } from 'react';

import { Text } from '../../primitives/text/text';
import { CHART_SERIES_LIMIT, compactNumber, ticks } from '../scale';
import { ChartFrame, describeCell } from './frame';
import {
  cellOf,
  domainOf,
  layoutColumns,
  type ColumnDatum,
  type ColumnLayout,
  type ColumnRect,
  type ColumnSeries,
} from './geometry';

export interface ColumnChartProps {
  /** The chart's accessible name, and the name of its data table (`<title> table`). */
  title: string;
  /** A sentence for assistive technology about what the chart shows. */
  summary?: string;
  /** One to four series, assigned the theme's slots in this order. */
  series: readonly ColumnSeries[];
  data: readonly ColumnDatum[];
  layout?: ColumnLayout;
  /** What the y values are, for the table. */
  valueLabel: string;
  /** What the x labels are, for the table. */
  xLabel: string;
  /** How a value reads in the table and on the one cap label. */
  formatValue?: (value: number) => string;
  /** How an axis tick reads. */
  formatTick?: (value: number) => string;
  /** The plot's height in svg units; the width is always the full container. */
  plotHeight?: number;
  emptyMessage?: string;
  /** Reloading: the frame dims and says it is busy, keeping the last numbers in view. */
  pending?: boolean;
}

const WIDTH = 960;
const MARGIN = { top: 18, right: 12, bottom: 28, left: 60 };
const DATA_END_RADIUS = 4;
const AXIS_FONT = 11;
const PROJECTED_STROKE = 1.5;
const BAND_OPACITY = 0.15;
const PROVISIONAL_OPACITY = 0.5;
/** The marks while the next answer loads; text and gridlines stay as they are. */
const PENDING_OPACITY = 0.45;
/** At most this many x labels, so they never collide. */
const MAX_X_LABELS = 12;

const plain = (value: number): string => value.toLocaleString('en-US');

/** A column as a path: a 4px rounded data end, square at the baseline, on whichever end is the data end. */
function columnPath({ x, y, width, height, negative }: ColumnRect): string {
  const r = Math.min(DATA_END_RADIUS, width / 2, height);
  const right = x + width;
  const bottom = y + height;
  if (height === 0) return '';
  return negative
    ? `M${x},${y} H${right} V${bottom - r} Q${right},${bottom} ${right - r},${bottom} H${x + r} Q${x},${bottom} ${x},${bottom - r} Z`
    : `M${x},${bottom} V${y + r} Q${x},${y} ${x + r},${y} H${right - r} Q${right},${y} ${right},${y + r} V${bottom} Z`;
}

/**
 * Columns over an ordered x — fiscal periods, months — with one to four
 * series stacked or grouped, drawn in the theme's series slots in order.
 * Measurements are solid; a projected cell is hatched with its band behind
 * it; a provisional cell is lighter; while pending, the marks dim and the
 * words do not. Gridlines sit at nice ticks, the one
 * direct label is the maximum column's, and every datum carries its values
 * as a native title. Text wears text tokens, never a series colour. A legend
 * and a data-table twin come from the frame.
 */
export function ColumnChart({
  title,
  summary,
  series,
  data,
  layout = 'stacked',
  valueLabel,
  xLabel,
  formatValue = plain,
  formatTick = compactNumber,
  plotHeight = 220,
  emptyMessage = 'Nothing to chart.',
  pending = false,
}: ColumnChartProps) {
  if (series.length > CHART_SERIES_LIMIT) {
    throw new Error(
      `a column chart shows at most ${CHART_SERIES_LIMIT} series; fold the rest into one`,
    );
  }
  const theme = useTheme();
  const patternBase = useId().replace(/:/g, '');
  const colors = series.map(
    (_, index) => theme.color.chart.series[index] ?? theme.color.accent.default,
  );
  const frame = { title, series, data, colors, valueLabel, xLabel, formatValue, pending };

  if (data.length === 0 || series.length === 0) {
    return (
      <ChartFrame {...frame}>
        <Text tone="muted" size="sm">
          {emptyMessage}
        </Text>
      </ChartFrame>
    );
  }

  const ids = series.map((item) => item.id);
  const tickValues = ticks(domainOf(data, ids, layout));
  const domain = { min: tickValues[0] ?? 0, max: tickValues[tickValues.length - 1] ?? 1 };
  const plot = { width: WIDTH - MARGIN.left - MARGIN.right, height: plotHeight, domain };
  const { columns, bands } = layoutColumns(data, ids, layout, plot);
  const y = (value: number): number =>
    MARGIN.top + plot.height - ((value - domain.min) / (domain.max - domain.min)) * plot.height;
  const stride = Math.ceil(data.length / MAX_X_LABELS);
  const slot = plot.width / data.length;
  const peak = columns.reduce<ColumnRect | null>(
    (best, column) =>
      best === null || Math.abs(column.cell.value) > Math.abs(best.cell.value) ? column : best,
    null,
  );
  const height = MARGIN.top + plot.height + MARGIN.bottom;

  return (
    <ChartFrame {...frame}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        role="img"
        aria-label={title}
        focusable="false"
        style={{ display: 'block', fontFamily: theme.font.family.base }}
      >
        <title>{title}</title>
        {summary ? <desc>{summary}</desc> : null}
        <defs>
          {colors.map((color, index) => (
            <pattern
              key={series[index]?.id ?? color}
              id={`${patternBase}-hatch-${index}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="2.5" height="6" fill={color} />
            </pattern>
          ))}
        </defs>
        {tickValues.map((value) => (
          <g key={value}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(value)}
              y2={y(value)}
              stroke={value === 0 ? theme.color.border.default : theme.color.border.subtle}
              strokeWidth="1"
            />
            <text
              x={MARGIN.left - 8}
              y={y(value)}
              dy="0.35em"
              textAnchor="end"
              fontSize={AXIS_FONT}
              fill={theme.color.text.muted}
            >
              {formatTick(value)}
            </text>
          </g>
        ))}
        <g opacity={pending ? PENDING_OPACITY : 1}>
          {bands.map((band) => (
            <rect
              key={`band-${band.datumIndex}-${band.seriesIndex}`}
              x={MARGIN.left + band.x}
              y={MARGIN.top + band.y}
              width={band.width}
              height={band.height}
              fill={colors[band.seriesIndex]}
              opacity={BAND_OPACITY}
            />
          ))}
          {data.map((datum, datumIndex) => (
            <g key={datum.label}>
              <title>
                {`${datum.label}: ${series
                  .map((item) => `${item.label} ${describeCell(datum, item.id, formatValue)}`)
                  .join('; ')}`}
              </title>
              {columns
                .filter((column) => column.datumIndex === datumIndex)
                .map((column) => (
                  <path
                    key={column.seriesIndex}
                    d={columnPath({
                      ...column,
                      x: MARGIN.left + column.x,
                      y: MARGIN.top + column.y,
                    })}
                    fill={
                      column.cell.projected
                        ? `url(#${patternBase}-hatch-${column.seriesIndex})`
                        : colors[column.seriesIndex]
                    }
                    fillOpacity={column.cell.provisional ? PROVISIONAL_OPACITY : 1}
                    stroke={column.cell.projected ? colors[column.seriesIndex] : 'none'}
                    strokeWidth={column.cell.projected ? PROJECTED_STROKE : 0}
                  />
                ))}
              {datumIndex % stride === 0 ? (
                <text
                  x={MARGIN.left + slot * datumIndex + slot / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={AXIS_FONT}
                  fill={theme.color.text.secondary}
                >
                  {datum.label}
                </text>
              ) : null}
            </g>
          ))}
        </g>
        {peak !== null ? (
          <text
            x={MARGIN.left + peak.x + peak.width / 2}
            y={
              peak.negative
                ? MARGIN.top + peak.y + peak.height + AXIS_FONT
                : MARGIN.top + peak.y - 5
            }
            textAnchor="middle"
            fontSize={AXIS_FONT}
            fill={theme.color.text.secondary}
          >
            {formatTick(cellOf(peak.cell).value)}
          </text>
        ) : null}
      </svg>
    </ChartFrame>
  );
}
