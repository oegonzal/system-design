import styled from '@emotion/styled';
import type { ElementType, HTMLAttributes } from 'react';

import { transient } from '../../theme/styled';
import type { SpaceIndex } from '../../theme/tokens';

export type SurfaceElement = 'div' | 'section' | 'aside' | 'article';

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  /** Landmark semantics when the panel is one — the findings panel is an aside. */
  as?: SurfaceElement;
  /** Interior padding, as a space-scale index. */
  padding?: SpaceIndex;
}

const Root = styled('div', transient)<{ $padding: SpaceIndex }>`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.sm};
  padding: ${({ theme, $padding }) => theme.space[$padding]}px;
`;

/**
 * A card panel — the raised plane content sits on.
 *
 * The hairline border earns its place in dark mode, where the shadow alone
 * all but disappears against the app background; in light mode it reads as a
 * crisp edge rather than a second affordance. Elevation beyond `shadow.sm`
 * is deliberately not a prop: a page of competing shadow depths is how
 * "surface" stops meaning anything.
 */
export function Surface({ as = 'div', padding = 5, ...rest }: SurfaceProps) {
  return <Root as={as as ElementType} $padding={padding} {...rest} />;
}
