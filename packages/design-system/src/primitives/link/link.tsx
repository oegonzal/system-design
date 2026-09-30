import styled from '@emotion/styled';
import type { AnchorHTMLAttributes } from 'react';

import { transient } from '../../theme/styled';
import type { AppTheme } from '../../theme/theme';

/**
 * `inline` — a link in running text, underlined in the accent;
 * `nav` — an item in a navigation list, quiet until current;
 * `card` — a whole block that is one link (a table row's title, a tile).
 */
export type LinkVariant = 'inline' | 'nav' | 'card';

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  $variant?: LinkVariant;
  /** The current route (`nav`) or the open item (`card`); pair it with `aria-current`. */
  $active?: boolean;
}

const byVariant = (theme: AppTheme, variant: LinkVariant, active: boolean): string => {
  switch (variant) {
    case 'inline':
      return `
        color: ${theme.color.text.primary};
        text-decoration: underline;
        text-decoration-color: ${theme.color.accent.default};
        text-underline-offset: 0.15em;
        &:hover { text-decoration-thickness: 2px; }
      `;
    case 'nav':
      return `
        display: inline-flex;
        align-items: center;
        padding: ${theme.space[2]}px ${theme.space[3]}px;
        border-radius: ${theme.radius.md};
        color: ${active ? theme.color.text.primary : theme.color.text.secondary};
        font-weight: ${active ? theme.font.weight.semibold : theme.font.weight.regular};
        text-decoration: none;
        box-shadow: ${active ? `inset 0 -2px 0 ${theme.color.accent.default}` : 'none'};
        &:hover { color: ${theme.color.text.primary}; background: ${theme.color.bg.subtle}; }
      `;
    case 'card':
      return `
        display: block;
        color: ${theme.color.text.primary};
        text-decoration: none;
        border-radius: ${theme.radius.sm};
        background: ${active ? theme.color.bg.selected : 'transparent'};
        &:hover { background: ${active ? theme.color.bg.selected : theme.color.bg.subtle}; }
      `;
  }
};

/**
 * The one anchor style. A styled `<a>` on purpose, so an app can route it
 * (`Link.withComponent(NextLink)`) in one file and every link in the app
 * keeps the same focus ring, the same three variants and the same colours.
 * Transient props (`$variant`, `$active`) never reach the DOM, whichever
 * component renders the anchor.
 */
export const Link = styled('a', transient)<LinkProps>`
  cursor: pointer;
  transition: color ${({ theme }) => theme.motion.duration.fast}
    ${({ theme }) => theme.motion.easing.standard};

  ${({ theme, $variant = 'inline', $active = false }) => byVariant(theme, $variant, $active)}

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;
