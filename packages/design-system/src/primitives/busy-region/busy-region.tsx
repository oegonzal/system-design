import styled from '@emotion/styled';
import type { HTMLAttributes } from 'react';

import { transient } from '../../theme/styled';

/** How far a thing dims while it is being read again — one number for a chart's marks and a panel alike. */
export const PENDING_OPACITY = 0.45;

export interface BusyRegionProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether what is shown is the last answer while the next is on its way. */
  busy: boolean;
}

const Root = styled('div', transient)<{ $busy: boolean }>`
  opacity: ${({ $busy }) => ($busy ? PENDING_OPACITY : 1)};
  transition: opacity ${({ theme }) => theme.motion.duration.fast}
    ${({ theme }) => theme.motion.easing.standard};
`;

/**
 * A panel that keeps showing its last answer while the next one loads:
 * dimmed, and marked busy for assistive technology, so numbers on their way
 * out are never read as the answer to what was just asked. Nothing is
 * unmounted, so the page does not jump when the answer lands.
 */
export function BusyRegion({ busy, children, ...rest }: BusyRegionProps) {
  return (
    <Root $busy={busy} aria-busy={busy || undefined} {...rest}>
      {children}
    </Root>
  );
}
