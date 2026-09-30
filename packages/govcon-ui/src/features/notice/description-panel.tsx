import { day, type Description } from '@sysdesign/contracts';
import { Alert, Button, Heading, PreformattedText, Stack, Text } from '@sysdesign/design-system';

export interface DescriptionPanelProps {
  description: Description | null;
  onFetch(): void;
  /** While the description request is in flight. */
  fetching?: boolean;
  /** Why the last fetch brought no text — the budget, or a failure. */
  problem?: string | null;
}

/** The notice text: stored once fetched, else one click that spends one request and says so. */
export function DescriptionPanel({
  description,
  onFetch,
  fetching = false,
  problem = null,
}: DescriptionPanelProps) {
  if (description) {
    return (
      <Stack gap={2}>
        <PreformattedText label="Description" text={description.text} />
        <Text tone="muted" size="sm">
          Fetched {day(description.fetchedAt)} — stored, no further request.
        </Text>
      </Stack>
    );
  }
  return (
    <Stack gap={2}>
      <Heading level={3}>Description</Heading>
      <Text tone="secondary" size="sm">
        Not fetched yet. Fetching spends one request; the text is then kept.
      </Text>
      <Stack direction="row" gap={3} align="center" wrap>
        <Button variant="solid" size="sm" onClick={onFetch} disabled={fetching}>
          {fetching ? 'Fetching…' : 'Fetch description (1 request)'}
        </Button>
      </Stack>
      {problem && <Alert tone="warn">{problem}</Alert>}
    </Stack>
  );
}
