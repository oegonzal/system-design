'use client';

import styled from '@emotion/styled';
import type { DesignRevisionSummaryDto } from '@sysdesign/contracts';
import { Badge, DECISION_TONE, Stack, Text, transient } from '@sysdesign/design-system';

export interface RevisionTimelineProps {
  revisions: DesignRevisionSummaryDto[];
  /** The revision currently loaded on the canvas, if any. */
  activeRevisionId?: string | null;
  onSelect: (revision: DesignRevisionSummaryDto) => void;
}

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
 * every revision the coach wrote. Selecting a chip loads that revision
 * read-only; the workspace owns that flow, this component only reports the
 * click. Presentational — Storybook-safe.
 */
export function RevisionTimeline({ revisions, activeRevisionId, onSelect }: RevisionTimelineProps) {
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
        return (
          <Chip
            key={revision.id}
            type="button"
            $active={revision.id === activeRevisionId}
            onClick={() => onSelect(revision)}
            data-testid={`revision-chip-${revision.revisionNumber}`}
          >
            #{revision.revisionNumber}
            {grade?.overall !== null && grade?.overall !== undefined ? (
              <Score data-testid="revision-score">{grade.overall}</Score>
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
          </Chip>
        );
      })}
    </Stack>
  );
}
