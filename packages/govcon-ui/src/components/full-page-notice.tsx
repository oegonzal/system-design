'use client';

import { Button, Heading, Stack, Surface, Text } from '@sysdesign/design-system';

import { useLink } from './link-context';

export interface FullPageNoticeProps {
  /** The heading — a short, plain statement of what happened. */
  title: string;
  /** One or two sentences the reader can act on. */
  message: string;
  /** Renders a Retry button — for a load that could succeed next time, never for a 404. */
  onRetry?: () => void;
  /** Renders a link away from the dead end. */
  backHref?: string;
}

/** The full-page status surface for a page that cannot show its content: a dead end always offers a way forward. */
export function FullPageNotice({ title, message, onRetry, backHref }: FullPageNoticeProps) {
  const Link = useLink();
  return (
    <Surface padding={6} data-testid="full-page-notice">
      <Stack gap={3}>
        <Heading level={1}>{title}</Heading>
        <Text tone="secondary">{message}</Text>
        {onRetry || backHref ? (
          <Stack direction="row" gap={4} align="center">
            {onRetry ? (
              <Button variant="subtle" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
            {backHref ? (
              <Link href={backHref} $variant="inline">
                Back to the dashboard
              </Link>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Surface>
  );
}
