import { css } from '@emotion/react';
import styled from '@emotion/styled';
import type { HTMLAttributes } from 'react';

import { shimmer } from '../../theme/motion';
import { transient } from '../../theme/styled';

export type SkeletonVariant = 'text' | 'block' | 'circle';

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /** Any CSS length. */
  width?: string;
  height?: string;
  variant?: SkeletonVariant;
}

/* See spinner.tsx: a stringified Keyframes is never registered. */
const shimmering = css`
  animation: ${shimmer} 1400ms linear infinite;
`;
const flat = css`
  animation: none;
`;

const RADIUS = {
  text: 'sm',
  block: 'md',
  circle: 'pill',
} as const satisfies Record<SkeletonVariant, 'sm' | 'md' | 'pill'>;

const Root = styled('span', transient)<{
  $width?: string;
  $height?: string;
  $variant: SkeletonVariant;
}>`
  display: block;
  width: ${({ $width }) => $width ?? '100%'};
  height: ${({ $height, $variant }) => $height ?? ($variant === 'text' ? '0.9em' : '100%')};
  border-radius: ${({ theme, $variant }) => theme.radius[RADIUS[$variant]]};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.bg.subtle} 25%,
    ${({ theme }) => theme.color.bg.surface} 50%,
    ${({ theme }) => theme.color.bg.subtle} 75%
  );
  background-size: 200% 100%;
  /*
   * Infinite, so the motion level reaches it as on/off rather than as a
   * duration — a shimmer clamped to 0.01ms is a strobe, which is worse than
   * the motion it replaced. Falls back to a flat tint, which still reads as a
   * placeholder.
   */
  ${({ theme }) => (theme.motion.level === 'reduced' ? flat : shimmering)}

  ${({ theme }) => theme.media.reducedMotion} {
    animation: none;
    background: ${({ theme }) => theme.color.bg.subtle};
  }
`;

/**
 * A loading placeholder.
 *
 * **Always `aria-hidden`, and not overridable.** The container carries
 * `aria-busy` and one `role="status"`; a canvas of a hundred individually
 * announcing skeletons is a screen-reader catastrophe, and that detail alone
 * is why this is a primitive rather than a one-off `<div>` in each feature.
 */
export function Skeleton({ width, height, variant = 'text', ...rest }: SkeletonProps) {
  return <Root {...rest} $width={width} $height={height} $variant={variant} aria-hidden="true" />;
}
