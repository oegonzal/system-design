'use client';

import styled from '@emotion/styled';
import type { DesignRevisionSummaryDto } from '@sysdesign/contracts';
import { Badge, DECISION_TONE, Stack, Text, transient } from '@sysdesign/design-system';

import { formatScore } from './score';

export interface RevisionTimelineProps {
  revisions: DesignRevisionSummaryDto[];
  /**
   * The revision the canvas shows as it was stored — one loaded read-only, or
   * the one the canvas was opened on or submitted as and has not been edited
   * since. Null once the canvas shows the draft.
   */
  activeRevisionId?: string | null;
  /** The revision whose grade the feedback tab shows — which need not be the one on the canvas. */
  feedbackRevisionId?: string | null;
  onSelect: (revision: DesignRevisionSummaryDto) => void;
}

/**
 * How a chip says which revision the workspace is on. The canvas and the
 * feedback tab are two places: restoring a revision as the draft, or opening
 * a session on a saved draft, leaves the feedback on a revision the canvas no
 * longer shows — and a chip must not call that one current.
 */
const PLACE_LABEL = { canvas: 'on canvas', feedback: 'feedback shown' } as const;

const Chip = styled('button', transient)<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[4]}px`};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.color.border.accent : theme.color.border.subtle)};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $active }) =>
    $active ? theme.color.bg.selected : theme.color.bg.surface};
  color: ${({ theme }) => theme.color.text.primary};
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

const Score = styled.span`
  color: ${({ theme }) => theme.color.text.muted};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  font-variant-numeric: tabular-nums;
`;

/**
 * One chip per revision — `#n score decision` — newest first, an AI badge on
 * every revision the coach wrote. The one the canvas shows is `aria-current`
 * and says "on canvas"; when the canvas shows the draft instead, no chip is
 * current, and the revision whose grade the feedback tab still shows says
 * "feedback shown". Selecting a chip loads that revision read-only; the
 * workspace owns that flow, this component only reports the click.
 * Presentational — Storybook-safe.
 */
export function RevisionTimeline({
  revisions,
  activeRevisionId = null,
  feedbackRevisionId = null,
  onSelect,
}: RevisionTimelineProps) {
  if (revisions.length === 0) {
    return (
      <Text size="sm" tone="muted">
        No revisions yet. Submit a design to start the trail.
      </Text>
    );
  }

  const ordered = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);

  return (
    <Stack direction="row" gap={2} wrap data-testid="revision-timeline">
      {ordered.map((revision) => {
        const grade = revision.evaluation;
        const active = revision.id === activeRevisionId;
        const place = active ? 'canvas' : revision.id === feedbackRevisionId ? 'feedback' : null;
        return (
          <Chip
            key={revision.id}
            type="button"
            $active={active}
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(revision)}
            data-testid={`revision-chip-${revision.revisionNumber}`}
            data-place={place ?? undefined}
          >
            #{revision.revisionNumber}
            {grade?.overall !== null && grade?.overall !== undefined ? (
              <Score data-testid="revision-score">{formatScore(grade.overall)}</Score>
            ) : null}
            {grade?.decision ? (
              <Badge tone={DECISION_TONE[grade.decision]} data-testid="revision-decision">
                {grade.decision}
              </Badge>
            ) : grade?.status === 'running' ? (
              <Badge tone="neutral">grading…</Badge>
            ) : grade?.status === 'failed' ? (
              <Badge tone="critical">failed</Badge>
            ) : null}
            {revision.origin === 'assistant' ? <Badge tone="accent">AI</Badge> : null}
            {place !== null ? (
              <Badge tone="neutral" data-testid="revision-place">
                {PLACE_LABEL[place]}
              </Badge>
            ) : null}
          </Chip>
        );
      })}
    </Stack>
  );
}
