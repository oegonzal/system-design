import styled from '@emotion/styled';
import type { FocusEvent, KeyboardEvent } from 'react';

import { Text } from '../../primitives/text/text';
import { transient } from '../../theme/styled';
import { cellNotes, DASH, describeDatum } from './frame';
import { cellOf, type ColumnDatum, type ColumnSeries, type SlotBox } from './geometry';

/**
 * The hover layer of a column chart, in HTML over the svg: one transparent
 * hit target per datum, the whole slot wide and the plot tall, and one
 * bubble that names every series at that x — the value first and strong, the
 * series name beside it under a short line in its colour. Hover, focus and
 * the arrow keys move it; leaving, blurring out or Escape hides it. The
 * targets rove one Tab stop, each named with the datum's words, so a reader
 * hears what a pointer sees; the numbers also live in the table twin, so the
 * bubble gates nothing.
 */
export interface ColumnTooltipProps {
  /** The chart's name; the layer is `<title> values`. */
  title: string;
  series: readonly ColumnSeries[];
  data: readonly ColumnDatum[];
  colors: readonly string[];
  formatValue: (value: number) => string;
  /** One per datum, as fractions of the frame. */
  boxes: readonly SlotBox[];
  active: number | null;
  onActiveChange(index: number | null): void;
}

const MOVES = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];

const Layer = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;

const Hit = styled('button', transient)<{ $box: SlotBox }>`
  position: absolute;
  left: ${({ $box }) => `${$box.left * 100}%`};
  width: ${({ $box }) => `${$box.width * 100}%`};
  top: ${({ $box }) => `${$box.top * 100}%`};
  height: ${({ $box }) => `${$box.height * 100}%`};
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  appearance: none;
  pointer-events: auto;
  cursor: default;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: -2px;
  }
`;

const Bubble = styled('div', transient)<{ $box: SlotBox }>`
  position: absolute;
  top: ${({ $box }) => `${$box.top * 100}%`};
  ${({ $box }) =>
    $box.after ? `left: ${($box.left + $box.width) * 100}%;` : `right: ${(1 - $box.left) * 100}%;`}
  z-index: ${({ theme }) => theme.zIndex.popover};
  min-width: 180px;
  max-width: 320px;
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[4]}px`};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.surface};
  box-shadow: ${({ theme }) => theme.shadow.md};
  pointer-events: none;
`;

const Rows = styled.ul`
  display: grid;
  gap: ${({ theme }) => theme.space[1]}px;
  margin: ${({ theme }) => theme.space[2]}px 0 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[2]}px;
`;

/** The series' identity beside its value: a short line in its colour, never a filled box. */
const Key = styled('span', transient)<{ $color: string }>`
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: ${({ $color }) => $color};
`;

const Value = styled.span`
  font-size: ${({ theme }) => theme.font.size.md};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.text.primary};
`;

/** Where the keys move focus among the hit targets, Home and End included. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (!MOVES.includes(event.key)) return;
  const targets = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-datum]')];
  const at = targets.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0 || targets.length === 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? targets.length - 1
        : event.key === 'ArrowRight'
          ? Math.min(at + 1, targets.length - 1)
          : Math.max(at - 1, 0);
  targets[next]?.focus();
}

export function ColumnTooltip({
  title,
  series,
  data,
  colors,
  formatValue,
  boxes,
  active,
  onActiveChange,
}: ColumnTooltipProps) {
  const shown = active === null ? undefined : data[active];
  const box = active === null ? undefined : boxes[active];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') onActiveChange(null);
    else moveFocus(event);
  };
  const onBlur = (event: FocusEvent<HTMLButtonElement>) => {
    const layer = event.currentTarget.parentElement;
    if (!layer || !(event.relatedTarget instanceof Node) || !layer.contains(event.relatedTarget)) {
      onActiveChange(null);
    }
  };
  return (
    <Layer
      role="group"
      aria-label={`${title} values`}
      onMouseLeave={() => onActiveChange(null)}
      onKeyDown={onKeyDown}
    >
      {data.map((datum, index) => {
        const slot = boxes[index];
        return slot === undefined ? null : (
          <Hit
            key={datum.label}
            type="button"
            $box={slot}
            data-datum={index}
            tabIndex={index === (active ?? 0) ? 0 : -1}
            aria-label={describeDatum(datum, series, formatValue)}
            onMouseEnter={() => onActiveChange(index)}
            onFocus={() => onActiveChange(index)}
            onBlur={onBlur}
          />
        );
      })}
      {shown !== undefined && box !== undefined ? (
        <Bubble role="tooltip" $box={box}>
          <Text as="span" size="sm" tone="secondary">
            {shown.label}
          </Text>
          <Rows>
            {series.map((item, index) => {
              const value = shown.values[item.id];
              const cell = value === undefined ? null : cellOf(value);
              return (
                <Row key={item.id}>
                  <Key $color={colors[index] ?? 'currentColor'} aria-hidden="true" />
                  <Value>{cell === null ? DASH : formatValue(cell.value)}</Value>
                  <Text as="span" size="sm" tone="secondary">
                    {item.label}
                  </Text>
                  {cell === null ? null : (
                    <Text as="span" size="sm" tone="muted">
                      {cellNotes(cell, formatValue).join(' ')}
                    </Text>
                  )}
                </Row>
              );
            })}
          </Rows>
        </Bubble>
      ) : null}
    </Layer>
  );
}
