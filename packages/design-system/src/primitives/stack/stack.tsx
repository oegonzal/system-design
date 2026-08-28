import styled from '@emotion/styled';
import type { ElementType, HTMLAttributes, Ref } from 'react';

import { transient } from '../../theme/styled';
import type { SpaceIndex } from '../../theme/tokens';

export type StackElement = 'div' | 'ul' | 'ol' | 'nav' | 'section' | 'header' | 'footer' | 'form';

export interface StackProps extends HTMLAttributes<HTMLElement> {
  /**
   * React 19 passes `ref` as an ordinary prop, but only if the props type
   * says so. Declared because the app shell has to focus its `<main>` on
   * navigation.
   */
  ref?: Ref<HTMLElement>;
  /** Semantics, when they matter. Lists get their bullets and padding removed. */
  as?: StackElement;
  direction?: 'row' | 'column';
  gap?: SpaceIndex;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
}

const ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
} as const;

const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
} as const;

const Root = styled('div', transient)<{
  $direction: NonNullable<StackProps['direction']>;
  $gap: SpaceIndex;
  $align: NonNullable<StackProps['align']>;
  $justify: NonNullable<StackProps['justify']>;
  $wrap: boolean;
}>`
  display: flex;
  flex-direction: ${({ $direction }) => $direction};
  gap: ${({ theme, $gap }) => theme.space[$gap]}px;
  align-items: ${({ $align }) => ALIGN[$align]};
  justify-content: ${({ $justify }) => JUSTIFY[$justify]};
  flex-wrap: ${({ $wrap }) => ($wrap ? 'wrap' : 'nowrap')};

  /* Harmless on a div, correct on ul/ol — so as="ul" needs no extra styling. */
  margin: 0;
  padding: 0;
  list-style: none;
`;

/**
 * One-dimensional layout.
 *
 * Gaps are indices into `theme.space`, so a spacing-scale change reaches
 * every stack in the product at once — and `theme.space[9]` stays a compile
 * error rather than an `undefined` in a CSS declaration.
 */
export function Stack({
  as = 'div',
  direction = 'column',
  gap = 3,
  align = 'stretch',
  justify = 'start',
  wrap = false,
  ref,
  ...rest
}: StackProps) {
  return (
    <Root
      as={as as ElementType}
      /* `as` picks the tag at runtime; the ref type follows the widest one. */
      ref={ref as Ref<HTMLDivElement>}
      $direction={direction}
      $gap={gap}
      $align={align}
      $justify={justify}
      $wrap={wrap}
      {...rest}
    />
  );
}
