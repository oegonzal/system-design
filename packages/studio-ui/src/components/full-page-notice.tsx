'use client';

import styled from '@emotion/styled';
import { Button, Heading, Stack, Surface, Text } from '@sysdesign/design-system';
import Link from 'next/link';

export interface FullPageNoticeProps {
  /** The heading — a short, plain statement of what happened. */
  title: string;
  /** One or two sentences the reader can act on. */
  message: string;
  /**
   * Renders a Retry button. Use for transient failures (network, 5xx) where
   * re-running the load could succeed — never for a 404, which will not change.
   */
  onRetry?: () => void;
  /** Renders a link away from the dead end, e.g. `/` for "Back to the dashboard". */
  backHref?: string;
}

/**
 * The full-page status surface for a page that cannot show its content: a
 * missing resource, or a load that failed. One place for a pattern the app
 * hand-rolled in four (`app/not-found.tsx`, the prompt and story detail pages,
 * the practice workspace), so a dead end always offers a way forward instead of
 * a raw server message.
 *
 * The design-system `Button` is a `<button>` only, so navigation is a
 * `next/link` `Link` (matching `app/not-found.tsx`); the Button is reserved for
 * the in-place Retry action (matching `EvaluationPanel`).
 */
const BackLink = styled(Link)`
  color: ${({ theme }) => theme.color.accent.default};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

export function FullPageNotice({ title, message, onRetry, backHref }: FullPageNoticeProps) {
  return (
    <Surface padding={6} data-testid="full-page-notice">
      <Stack gap={3}>
        <Heading level={1}>{title}</Heading>
        <Text tone="secondary">{message}</Text>
        {onRetry || backHref ? (
          <Stack direction="row" gap={4} align="center">
            {onRetry ? (
              <Button variant="subtle" onClick={onRetry} data-testid="notice-retry">
                Retry
              </Button>
            ) : null}
            {backHref ? (
              <BackLink href={backHref} data-testid="notice-back">
                Back to the dashboard
              </BackLink>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Surface>
  );
}
