'use client';

import styled from '@emotion/styled';
import type { ButtonHTMLAttributes } from 'react';

const Root = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: transparent;
  /* Inherit the chip's fg so the pair's asserted contrast carries over. */
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

export type ChipRemoveButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'children'
> & {
  /** Required: the glyph says nothing, so the name must. */
  'aria-label': string;
};

/**
 * The little × that lives inside a chip (a responsibility, an undeclared
 * carry). A raw styled button rather than the design system's `Button`: it
 * inherits the chip's typography and colour pair instead of bringing its own
 * padding and background into a 1px-padded pill.
 */
export function ChipRemoveButton(props: ChipRemoveButtonProps) {
  return (
    <Root type="button" {...props}>
      <span aria-hidden>×</span>
    </Root>
  );
}
