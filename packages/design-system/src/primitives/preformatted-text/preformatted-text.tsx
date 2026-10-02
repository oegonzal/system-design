import styled from '@emotion/styled';
import type { HTMLAttributes } from 'react';

import { Heading } from '../heading/heading';
import { Stack } from '../stack/stack';

const Pre = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.space[4]}px;
  max-height: 32rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text.primary};
  background: ${({ theme }) => theme.color.bg.subtle};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.sm};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

export interface PreformattedTextProps extends HTMLAttributes<HTMLDivElement> {
  /** The heading over the block, and the block's accessible name. */
  label: string;
  text: string;
}

/**
 * A document shown exactly as written — a rendered artifact whose bracketed
 * ids a finding cites, a raw export. The author's own line breaks and
 * markup stay visible verbatim. For a document meant to be *read* — a
 * prompt, a library preview — use `Markdown`, which renders it.
 *
 * The block is focusable because it is capped and scrolls. A scroll region that
 * holds no focusable content of its own is unreachable by keyboard otherwise —
 * the text is simply lost below the fold for anyone not using a mouse. It
 * already carries its label as an accessible name, so focusing it announces
 * what it is.
 */
export function PreformattedText({ label, text, ...rest }: PreformattedTextProps) {
  return (
    <Stack gap={2} {...rest}>
      <Heading level={3}>{label}</Heading>
      <Pre aria-label={label} tabIndex={0}>
        {text}
      </Pre>
    </Stack>
  );
}
