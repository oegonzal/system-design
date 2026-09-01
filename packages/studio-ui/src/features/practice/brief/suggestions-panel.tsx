'use client';

import { Button, Stack, Text } from '@sysdesign/design-system';

export interface SuggestionsPanelProps {
  asking: boolean;
  error: string | null;
  askedAndEmpty: boolean;
  /** How many proposals are currently awaiting an answer. */
  pending: number;
  canAsk: boolean;
  onAsk: () => void;
}

/**
 * The request half of suggestions: one button, and an honest account of what
 * came back. Presentational — the workspace owns the hook.
 *
 * Deliberately absent: an "accept all". Every proposal has to be taken one at a
 * time, beside the requirement it is about, because a single click that adopts
 * the model's whole reading of the design would make the explanation dimension
 * measure the model instead of the author. The friction is the feature.
 */
export function SuggestionsPanel({
  asking,
  error,
  askedAndEmpty,
  pending,
  canAsk,
  onAsk,
}: SuggestionsPanelProps) {
  return (
    <Stack gap={2} data-testid="brief-suggestions-panel">
      <Stack direction="row" gap={3} align="center" wrap>
        <div>
          <Button
            variant="subtle"
            size="sm"
            disabled={asking || !canAsk}
            onClick={onAsk}
            data-testid="ask-for-suggestions"
          >
            {asking ? 'Asking…' : 'Suggest bindings'}
          </Button>
        </div>
        {pending > 0 ? (
          <Text as="span" size="sm" tone="muted" data-testid="suggestions-pending">
            {pending} suggestion{pending === 1 ? '' : 's'} to accept or dismiss
          </Text>
        ) : null}
      </Stack>

      {!canAsk ? (
        <Text size="sm" tone="muted" data-testid="suggestions-need-canvas">
          Draw some components first — there is nothing to reason about yet.
        </Text>
      ) : null}

      {/*
        The model being off is not an error and does not change the response
        shape; it just means the list came back empty. Both cases say so in the
        same slot, because from here they are the same fact: no help arrived.
      */}
      {askedAndEmpty ? (
        <Text size="sm" tone="muted" data-testid="suggestions-empty">
          No suggestions came back. Either no model is configured, or it had nothing it could stand
          behind for this design — the brief is yours to write.
        </Text>
      ) : null}

      {error !== null ? (
        <Text size="sm" tone="secondary" data-testid="suggestions-error">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
