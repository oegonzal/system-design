import { css } from '@emotion/react';
import styled from '@emotion/styled';
import type { HTMLAttributes } from 'react';

import { sweep } from '../../theme/motion';

export interface BusyRegionProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether what is shown is the last answer while the next is on its way. */
  busy: boolean;
}

const BAR_HEIGHT_PX = 3;

/* See spinner.tsx: a stringified Keyframes is never registered. */
const sweeping = css`
  width: 40%;
  animation: ${sweep} 1200ms ease-in-out infinite;
`;
const still = css`
  width: 100%;
  animation: none;
`;

const Root = styled.div`
  position: relative;
`;

/**
 * Decoration across the region's top edge. An infinite sweep cannot be
 * scaled by duration, so the motion level reaches it as on or off: stilled,
 * it is a solid strip, which still says the region is busy.
 */
const Bar = styled.span`
  position: absolute;
  inset: 0 0 auto 0;
  height: ${BAR_HEIGHT_PX}px;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.border.subtle};
  pointer-events: none;

  &::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: ${({ theme }) => theme.color.accent.default};
    ${({ theme }) => (theme.motion.level === 'reduced' ? still : sweeping)}
  }

  ${({ theme }) => theme.media.reducedMotion} {
    &::after {
      width: 100%;
      animation: none;
    }
  }
`;

/**
 * A panel that keeps showing its last answer while the next one loads: a
 * bar runs across its top edge, and it is marked busy for assistive
 * technology, so numbers on their way out are not taken for the answer to
 * what was just asked. The answer itself stays as it is — dimming it would
 * take its text below a readable contrast for exactly as long as someone is
 * waiting on it. Nothing is unmounted, so the page does not jump when the
 * next answer lands.
 */
export function BusyRegion({ busy, children, ...rest }: BusyRegionProps) {
  return (
    <Root aria-busy={busy || undefined} {...rest}>
      {busy ? <Bar aria-hidden="true" /> : null}
      {children}
    </Root>
  );
}
