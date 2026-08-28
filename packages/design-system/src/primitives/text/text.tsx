import styled from '@emotion/styled';
import type { ElementType, HTMLAttributes } from 'react';

import { transient } from '../../theme/styled';

export type TextTone = 'primary' | 'secondary' | 'muted';
export type TextSize = 'sm' | 'md' | 'lg';
export type TextElement = 'p' | 'span';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  /** Semantics, when they matter — a caption inside a button wants a span. */
  as?: TextElement;
  tone?: TextTone;
  size?: TextSize;
}

const Root = styled('p', transient)<{ $tone: TextTone; $size: TextSize }>`
  margin: 0;
  font-size: ${({ theme, $size }) => theme.font.size[$size]};

  color: ${({ theme, $tone }) =>
    ({
      primary: theme.color.text.primary,
      secondary: theme.color.text.secondary,
      muted: theme.color.text.muted,
    })[$tone]};
`;

/**
 * Body copy, in the three roles the product actually uses it in.
 *
 * Semantic props rather than raw values on purpose: a consumer says *what*
 * the text is, not what size to render it at, so a change to the type scale
 * reaches every caption at once. All three tones clear 4.5:1 on every
 * background role — asserted in `contrast.spec.ts`, not assumed.
 */
export function Text({ as = 'p', tone = 'primary', size = 'md', ...rest }: TextProps) {
  return <Root as={as as ElementType} $tone={tone} $size={size} {...rest} />;
}
