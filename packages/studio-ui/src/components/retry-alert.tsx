import { Alert, Button, Stack } from '@sysdesign/design-system';

export interface RetryAlertProps {
  /** What could not load: "Couldn't load your sessions". */
  title: string;
  /** Why, as copy a person can read. */
  message: string;
  onRetry: () => void;
  /** True while the retry is in flight. */
  retrying?: boolean;
  'data-testid'?: string;
}

/**
 * A part of a page that could not load, in its own place: what, why, and a
 * Retry that loads that part again. The rest of the page stays as it is —
 * one failed list never takes down a section that loaded. Pure props, so a
 * section's error state is a story.
 */
export function RetryAlert({
  title,
  message,
  onRetry,
  retrying = false,
  'data-testid': testId,
}: RetryAlertProps) {
  return (
    <Alert tone="danger" title={title} data-testid={testId}>
      <Stack gap={2} align="start">
        <span>{message}</span>
        <Button variant="subtle" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      </Stack>
    </Alert>
  );
}
