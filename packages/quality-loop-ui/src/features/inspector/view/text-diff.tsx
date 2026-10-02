import styled from '@emotion/styled';
import { Badge, Stack, Text } from '@sysdesign/design-system';

import { countLines, lineDiff } from '../model/line-diff';

/**
 * The rendered artifact, line by line.
 *
 * This is the one field where a whole-value replacement tells a reader nothing:
 * it is the text every judge actually read, and what matters is the three lines
 * that changed in two hundred. Each line carries its marker as a character as
 * well as a colour, so the comparison survives monochrome and a screen reader.
 */

const Pane = styled.pre`
  margin: 0;
  overflow-x: auto;
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  background: ${({ theme }) => theme.color.bg.subtle};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: ${({ theme }) => theme.space[3]}px;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

const Line = styled.span<{ $kind: 'same' | 'added' | 'removed' }>`
  display: block;
  white-space: pre;
  color: ${({ theme, $kind }) =>
    $kind === 'added'
      ? theme.color.success.fg
      : $kind === 'removed'
        ? theme.color.danger.fg
        : theme.color.text.primary};
  background: ${({ theme, $kind }) =>
    $kind === 'added'
      ? theme.color.success.bg
      : $kind === 'removed'
        ? theme.color.danger.bg
        : 'transparent'};
`;

const MARKER = { same: ' ', added: '+', removed: '-' } as const;

export interface TextDiffProps {
  before: string | null;
  after: string | null;
  label?: string;
}

export function TextDiff({ before, after, label = 'Rendered artifact' }: TextDiffProps) {
  const lines = lineDiff(before, after);
  const counts = countLines(lines);
  if (lines.length === 0) {
    return (
      <Text tone="muted" size="sm">
        There is no rendered artifact on either side.
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={2} align="center" wrap>
        <Badge tone="success">+{counts.added}</Badge>
        <Badge tone="critical">−{counts.removed}</Badge>
        <Text as="span" tone="muted" size="sm">
          {counts.same} unchanged
        </Text>
      </Stack>
      {/* Focusable: it scrolls sideways and holds nothing focusable of its own,
          so a keyboard-only reader could not reach the lines past the edge. */}
      <Pane aria-label={label} tabIndex={0}>
        {lines.map((line) => (
          // A line's identity is which line it is on each side: a same line has
          // both numbers, a removal only the old one, an addition only the new.
          <Line key={`r${line.before ?? ''}a${line.after ?? ''}`} $kind={line.kind}>
            {MARKER[line.kind]} {line.text}
          </Line>
        ))}
      </Pane>
    </Stack>
  );
}
