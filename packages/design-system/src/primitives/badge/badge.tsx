import styled from '@emotion/styled';
import type { NodeKind, Severity } from '@sysdesign/contracts';
import type { HTMLAttributes } from 'react';

import { transient } from '../../theme/styled';
import type { AppTheme } from '../../theme/theme';

export type BadgeTone = 'neutral' | 'accent' | Severity;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * `neutral`/`accent` for counts and states; a `Severity` for finding
   * chips, which colour from the same pairs the findings panel uses.
   */
  tone?: BadgeTone;
  /**
   * A canvas identity chip — "database", "queue" — coloured from the
   * mode-independent node-kind map. Wins over `tone` when both are given,
   * because a kind chip that changed colour with the theme would stop being
   * an identity.
   */
  kind?: NodeKind;
}

const colors = (theme: AppTheme, tone: BadgeTone, kind: NodeKind | undefined) => {
  if (kind) return { bg: theme.color.nodeKind[kind], fg: theme.color.nodeKindFg[kind] };
  if (tone === 'neutral') return { bg: theme.color.bg.subtle, fg: theme.color.text.secondary };
  if (tone === 'accent') return { bg: theme.color.bg.selected, fg: theme.color.text.onSelected };
  return theme.color.severity[tone];
};

const Root = styled('span', transient)<{ $tone: BadgeTone; $kind: NodeKind | undefined }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => `1px ${theme.space[3]}px`};
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  white-space: nowrap;

  background: ${({ theme, $tone, $kind }) => colors(theme, $tone, $kind).bg};
  color: ${({ theme, $tone, $kind }) => colors(theme, $tone, $kind).fg};
`;

/**
 * A small piece of metadata beside something else.
 *
 * Renders a bare `<span>` with **no role**. Giving it `role="status"` would
 * make every chip in a hundred-node canvas announce itself; when a count does
 * need announcing, the consumer wraps it in a `LiveRegion`.
 */
export function Badge({ tone = 'neutral', kind, ...rest }: BadgeProps) {
  return <Root $tone={tone} $kind={kind} {...rest} />;
}
