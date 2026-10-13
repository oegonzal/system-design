import styled from '@emotion/styled';
import type { HTMLAttributes, ReactNode } from 'react';

import { Surface } from '../surface/surface';
import { Text } from '../text/text';

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  /** What the figure is, in sentence case, no colon. */
  label: string;
  /** The figure itself, already formatted by the caller. */
  value: ReactNode;
  /** A second line under the figure — a comparison, a window, a count. */
  detail?: ReactNode;
}

const Figure = styled.span`
  display: block;
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.primary};
`;

/**
 * One headline figure on its own surface: the label above, the figure large,
 * an optional detail line below. The figure is whatever the caller formatted
 * — money, a count, a date — so a tile never disagrees with the table beside
 * it about how a number is spelled. Text wears text tokens only.
 */
export function StatTile({ label, value, detail, ...rest }: StatTileProps) {
  return (
    <Surface padding={4} {...rest}>
      <Text as="span" tone="secondary" size="sm">
        {label}
      </Text>
      <Figure>{value}</Figure>
      {detail === undefined ? null : (
        <Text as="span" tone="muted" size="sm">
          {detail}
        </Text>
      )}
    </Surface>
  );
}

/** A responsive row of tiles; give it an `aria-label` so the group can be found by name. */
export const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.space[3]}px;
`;
