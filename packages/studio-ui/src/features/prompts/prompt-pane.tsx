'use client';

import type { PromptDto, SuccessCriterion } from '@sysdesign/contracts';
import {
  Badge,
  Button,
  Heading,
  PreformattedText,
  Spinner,
  Stack,
  Text,
} from '@sysdesign/design-system';

import { groupCriteriaByKind, humanizeKind } from './criteria';

export interface PromptPaneProps {
  prompt: PromptDto;
  /** The rubric as resolved by `usePromptCriteria`; defaults to the prompt's own. */
  criteria?: SuccessCriterion[];
  /** True while the quality loop is deriving the rubric. */
  deriving?: boolean;
  /** Why the last derivation failed — the grader was unavailable. */
  deriveError?: string | null;
  /** Ask for the rubric (again). Absent → no button. */
  onDerive?: () => void;
}

/**
 * The prompt, readable at a glance while designing: its markdown exactly as
 * written, and the criteria the quality loop derived from it, grouped by
 * kind — the same ids the brief binds and the feedback cites. Pure props —
 * Storybook-safe.
 */
export function PromptPane({
  prompt,
  criteria = prompt.criteria,
  deriving = false,
  deriveError = null,
  onDerive,
}: PromptPaneProps) {
  const groups = groupCriteriaByKind(criteria);

  return (
    <Stack gap={5} data-testid="prompt-pane">
      <Stack gap={2}>
        <Heading level={2}>{prompt.title}</Heading>
        <Stack direction="row" gap={2} wrap>
          <Badge tone="neutral" data-testid="prompt-source">
            {prompt.source}
          </Badge>
          {prompt.status === 'archived' ? <Badge tone="neutral">archived</Badge> : null}
        </Stack>
      </Stack>

      <PreformattedText label="Prompt" text={prompt.markdown} data-testid="prompt-markdown" />

      <Stack gap={3}>
        <Heading level={3}>Criteria</Heading>
        {deriving ? (
          <Stack direction="row" gap={3} align="center" data-testid="prompt-criteria-normalizing">
            <Spinner label="" />
            <Text size="sm" tone="secondary">
              Normalizing the requirements into criteria…
            </Text>
          </Stack>
        ) : groups.length === 0 ? (
          <Stack gap={3} data-testid="prompt-criteria-empty">
            <Text size="sm" tone="muted">
              {deriveError !== null
                ? `The grader is unavailable, so the requirements could not be normalized. ${deriveError}`
                : 'The requirements have not been normalized into criteria yet.'}
            </Text>
            {onDerive ? (
              <div>
                <Button variant="subtle" onClick={onDerive} data-testid="derive-criteria">
                  Derive criteria
                </Button>
              </div>
            ) : null}
          </Stack>
        ) : (
          groups.map((group) => (
            <Stack key={group.kind} gap={2} data-testid={`criteria-group-${group.kind}`}>
              <Heading level={4}>{humanizeKind(group.kind)}</Heading>
              <Stack as="ul" gap={2}>
                {group.criteria.map((criterion) => (
                  <li key={criterion.id} data-testid={`criterion-${criterion.id}`}>
                    <Stack direction="row" gap={2} align="baseline" wrap>
                      <Badge tone="accent" data-testid="criterion-chip">
                        {criterion.id}
                      </Badge>
                      <Text as="span" size="sm">
                        {criterion.statement}
                      </Text>
                    </Stack>
                  </li>
                ))}
              </Stack>
            </Stack>
          ))
        )}
      </Stack>
    </Stack>
  );
}
