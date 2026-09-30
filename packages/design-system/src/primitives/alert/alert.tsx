import styled from '@emotion/styled';
import type { HTMLAttributes, ReactNode } from 'react';

import { transient } from '../../theme/styled';
import type { AppTheme } from '../../theme/theme';

/** The four intents the theme prices as foreground/background pairs. */
export type AlertTone = 'info' | 'success' | 'warn' | 'danger';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  /** A short first line; the body is the children. */
  title?: string;
  children?: ReactNode;
}

/** Danger and warnings interrupt; the rest wait their turn. As data, so no consumer picks a role. */
export const ALERT_ROLE: Record<AlertTone, 'alert' | 'status'> = {
  danger: 'alert',
  warn: 'alert',
  success: 'status',
  info: 'status',
};

const pair = (theme: AppTheme, tone: AlertTone) => theme.color[tone];

const Root = styled('div', transient)<{ $tone: AlertTone }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]}px;
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[4]}px`};
  border-radius: ${({ theme }) => theme.radius.md};
  border-left: 4px solid ${({ theme, $tone }) => pair(theme, $tone).fg};
  background: ${({ theme, $tone }) => pair(theme, $tone).bg};
  color: ${({ theme, $tone }) => pair(theme, $tone).fg};
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

const Title = styled.strong`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

/**
 * A message beside the thing it is about — a failed fetch, a spent budget,
 * a saved profile, a field's issue. The tone chooses the colour pair and the
 * role: `danger` and `warn` are `role="alert"` and interrupt, `success` and
 * `info` are `role="status"` and wait.
 */
export function Alert({ tone = 'info', title, children, ...rest }: AlertProps) {
  return (
    <Root $tone={tone} role={ALERT_ROLE[tone]} {...rest}>
      {title ? <Title>{title}</Title> : null}
      {children}
    </Root>
  );
}
