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
  /** What the way out says — where it leads. Defaults to the dashboard's name. */
  backLabel?: string;
}

/** A dead end reads as a card in the middle of the page, not a banner across it. */
const Wrap = styled.div`
  width: 100%;
  max-width: 560px;
  margin: ${({ theme }) => theme.space[8]}px auto;
`;

/**
 * The design-system `Button` is a `<button>` only, so navigation is a
 * `next/link` `Link`; the Button is reserved for the in-place Retry action
 * (matching `EvaluationPanel`).
 */
const BackLink = styled(Link)`
  color: ${({ theme }) => theme.color.accent.default};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

/**
 * The full-page status surface for a page that cannot show its content: a
 * missing resource, a load that failed, an address no route answers. One
 * place for the pattern, so a dead end always offers a way forward instead
 * of a raw server message. A page that loads one resource reaches it through
 * `LoadFailureNotice`, which decides between missing and failed.
 */
export function FullPageNotice({
  title,
  message,
  onRetry,
  backHref,
  backLabel = 'Back to the dashboard',
}: FullPageNoticeProps) {
  return (
    <Wrap>
      <Surface padding={6} data-testid="full-page-notice">
        <Stack gap={3}>
          <Heading level={1}>{title}</Heading>
          <Text tone="secondary">{message}</Text>
          {onRetry || backHref ? (
            <Stack direction="row" gap={4} align="center" wrap>
              {onRetry ? (
                <Button variant="subtle" onClick={onRetry} data-testid="notice-retry">
                  Retry
                </Button>
              ) : null}
              {backHref ? (
                <BackLink href={backHref} data-testid="notice-back">
                  {backLabel}
                </BackLink>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </Surface>
    </Wrap>
  );
}
