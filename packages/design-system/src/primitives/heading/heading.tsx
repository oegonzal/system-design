import styled from '@emotion/styled';
import type { ElementType, HTMLAttributes } from 'react';

import { transient } from '../../theme/styled';
import type { fontSize } from '../../theme/tokens';

export type HeadingLevel = 1 | 2 | 3 | 4;

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * Document outline position — `1` renders `<h1>`, and so on. The size
   * follows the level through `LEVEL_SIZE` rather than being a second prop:
   * a heading whose visual weight disagrees with its outline position is
   * usually a document-structure bug, and the rare exception can restyle.
   */
  level?: HeadingLevel;
}

/** One decision, made once: which step of the type scale each level reads. */
const LEVEL_SIZE = {
  1: 'xxl',
  2: 'xl',
  3: 'lg',
  4: 'md',
} as const satisfies Record<HeadingLevel, keyof typeof fontSize>;

const Root = styled('h2', transient)<{ $level: HeadingLevel }>`
  margin: 0;
  font-size: ${({ theme, $level }) => theme.font.size[LEVEL_SIZE[$level]]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
`;

/**
 * A section title.
 *
 * Defaults to `2` because most headings introduce a section, not a page —
 * one `<h1>` per route is the app's invariant, and making level 1 opt-in
 * keeps a copy-pasted panel from minting a second one.
 */
export function Heading({ level = 2, ...rest }: HeadingProps) {
  return <Root as={`h${level}` as ElementType} $level={level} {...rest} />;
}
