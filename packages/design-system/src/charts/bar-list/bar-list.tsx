import styled from '@emotion/styled';
import type { ReactNode } from 'react';

import { Text } from '../../primitives/text/text';

export interface BarListItem {
  id: string;
  /** What the bar is of — text, or a link to it when it has a page of its own. */
  label: ReactNode;
  /** A second word under the label — a code, an abbreviation. */
  detail?: string | null;
  value: number;
  /** The item's share of the whole, 0..1, when the whole is known. */
  share?: number | null;
}

export interface BarListProps {
  /** The list's accessible name. */
  title: string;
  /** In rank order, as given. */
  items: readonly BarListItem[];
  formatValue: (value: number) => string;
  formatShare?: (share: number) => string;
  emptyMessage?: string;
}

const List = styled.ol`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2fr auto auto;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  font-size: ${({ theme }) => theme.font.size.sm};
`;

const Label = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: ${({ theme }) => theme.color.text.primary};

  code {
    color: ${({ theme }) => theme.color.text.muted};
    font-size: ${({ theme }) => theme.font.size.xs};
  }
`;

const Track = styled.span`
  display: block;
  height: 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.subtle};
  overflow: hidden;
`;

const Fill = styled.span`
  display: block;
  height: 100%;
  border-radius: inherit;
  background: ${({ theme }) => theme.color.chart.series[0]};
`;

const Value = styled.span`
  color: ${({ theme }) => theme.color.text.primary};
  font-variant-numeric: tabular-nums;
  text-align: right;
`;

const Share = styled.span`
  color: ${({ theme }) => theme.color.text.muted};
  font-variant-numeric: tabular-nums;
  text-align: right;
  min-width: 3.5em;
`;

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/**
 * Ranked horizontal bars, one hue — these are names, not a scale, so slot 1
 * for every bar and the length alone carries magnitude. The list is its own
 * text alternative: label, value and share are text; the bar is decoration
 * beside them.
 */
export function BarList({
  title,
  items,
  formatValue,
  formatShare = percent,
  emptyMessage = 'Nothing to rank.',
}: BarListProps) {
  if (items.length === 0) {
    return (
      <Text tone="muted" size="sm">
        {emptyMessage}
      </Text>
    );
  }
  const widest = Math.max(0, ...items.map((item) => item.value));
  return (
    <List aria-label={title}>
      {items.map((item) => (
        <Row key={item.id}>
          <Label>
            <span>{item.label}</span>
            {item.detail ? <code>{item.detail}</code> : null}
          </Label>
          <Track aria-hidden="true">
            <Fill
              style={{
                width: `${widest > 0 ? (Math.max(0, item.value) / widest) * 100 : 0}%`,
              }}
            />
          </Track>
          <Value>{formatValue(item.value)}</Value>
          <Share>
            {item.share === null || item.share === undefined ? '' : formatShare(item.share)}
          </Share>
        </Row>
      ))}
    </List>
  );
}
