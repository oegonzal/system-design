import { css } from '@emotion/react';
import styled from '@emotion/styled';
import type { HTMLAttributes } from 'react';

import { spin } from '../../theme/motion';
import { transient } from '../../theme/styled';
import { VisuallyHidden } from '../visually-hidden/visually-hidden';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md';
  /**
   * Pass an empty string when a parent live region already announces the
   * same thing — two regions describing one load is noise, not redundancy.
   */
  label?: string;
}

const SIZE_PX = { sm: 14, md: 20 } as const;

/*
 * `css` rather than an interpolated string: a Keyframes stringified into one
 * skips Emotion's registration step, and the animation silently does nothing.
 */
const spinning = css`
  animation: ${spin} 700ms linear infinite;
`;
const still = css`
  animation: none;
`;

const Ring = styled('span', transient)<{ $size: 'sm' | 'md' }>`
  display: inline-block;
  width: ${({ $size }) => SIZE_PX[$size]}px;
  height: ${({ $size }) => SIZE_PX[$size]}px;
  border: 2px solid ${({ theme }) => theme.color.border.subtle};
  border-top-color: ${({ theme }) => theme.color.accent.default};
  border-radius: ${({ theme }) => theme.radius.pill};
  /*
   * An infinite rotation cannot be scaled by duration — at 0.01ms it is a
   * strobe, and at 0ms it is undefined. So the motion level reaches it as an
   * on/off decision instead, which is what motion.level is on the theme for.
   * The ring simply stops; the visually hidden label still announces, so
   * nothing is lost but the spin.
   */
  ${({ theme }) => (theme.motion.level === 'reduced' ? still : spinning)}

  ${({ theme }) => theme.media.reducedMotion} {
    animation: none;
  }
`;

export function Spinner({ size = 'sm', label = 'Loading…', ...rest }: SpinnerProps) {
  return (
    <span role="status" {...rest}>
      <Ring $size={size} aria-hidden="true" />
      {label ? <VisuallyHidden>{label}</VisuallyHidden> : null}
    </span>
  );
}
