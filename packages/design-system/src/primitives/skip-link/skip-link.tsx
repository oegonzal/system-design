import styled from '@emotion/styled';
import type { AnchorHTMLAttributes } from 'react';

export interface SkipLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** The element to jump to, e.g. `#main`. */
  href: string;
}

/**
 * The first focusable element on the page, hidden until it is focused.
 *
 * Deliberately not built on `VisuallyHidden`: revealing on focus is the
 * entire behaviour here, and a hidden utility that sometimes shows itself is
 * wrong for both jobs.
 */
export const SkipLink = styled.a<SkipLinkProps>`
  position: absolute;
  left: ${({ theme }) => theme.space[4]}px;
  top: ${({ theme }) => theme.space[4]}px;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[5]}px`};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.accent.default};
  color: ${({ theme }) => theme.color.accent.fg};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: none;

  /* Off-screen rather than display:none, so it stays in the tab order. */
  transform: translateY(-200%);
  transition: transform ${({ theme }) => theme.motion.duration.fast}
    ${({ theme }) => theme.motion.easing.standard};

  &:focus-visible {
    transform: none;
  }
`;
