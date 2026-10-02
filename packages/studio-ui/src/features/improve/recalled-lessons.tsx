'use client';

import styled from '@emotion/styled';
import type { RunRecallDto, RunRecallReason } from '@sysdesign/contracts';
import { Button, Stack, Text } from '@sysdesign/design-system';
import { useId, useState } from 'react';

import { WrappingText } from '../evaluation/wrapping-text';

/**
 * Why the coach ran without lessons from earlier runs, in the author's terms.
 * Every reason the contract names; an empty recall and a skipped one read
 * differently because they are different facts.
 */
const WITHOUT_COPY: Record<RunRecallReason, string> = {
  'store-empty': 'No lessons from earlier runs are stored yet, so the coach worked without any.',
  'not-accepted': 'No lessons from earlier runs passed review for this prompt.',
  'no-usable-memory': 'No lessons from earlier runs fit this prompt.',
  'no-produce-iteration':
    'The coach had one iteration, which grades the design without revising it, so it needed no lessons.',
  'recall-unavailable': 'The coach ran without lessons from earlier runs: recall is not set up.',
  'embeddings-disabled':
    'The coach ran without lessons from earlier runs: recall is off on this grader.',
  'store-unavailable':
    'The coach ran without lessons from earlier runs: the lesson store could not be reached.',
  'pipeline-unavailable':
    'The coach ran without lessons from earlier runs: lessons cannot be reviewed right now.',
  'embedding-failed':
    'The coach ran without lessons from earlier runs: the search for them failed.',
  'run-failed': 'The coach ran without lessons from earlier runs: reviewing them failed.',
  errored: 'The coach ran without lessons from earlier runs: recall hit an error.',
};

/**
 * What stands before each part of a lesson the curator worded freely. Labels
 * rather than a sentence built around its words: `serves` and `caveat` are
 * whatever the curator wrote — a phrase, a clause, a sentence — and read
 * right after a label however they are phrased.
 */
const LESSON_LABEL = { serves: 'Where it helps', caveat: 'Keep in mind' } as const;

/**
 * The list behind the toggle. Its own element rather than a `Stack`, because a
 * layout `display` outranks the browser's `[hidden]` rule: the collapsed list
 * must say `display: none` itself or it never collapses.
 */
const LessonList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  margin: 0;
  padding: 0;
  list-style: none;

  &[hidden] {
    display: none;
  }
`;

const LessonItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]}px;
  padding-left: ${({ theme }) => theme.space[3]}px;
  border-left: 2px solid ${({ theme }) => theme.color.border.subtle};
`;

export interface RecalledLessonsProps {
  /** The run's recall; null when it did not recall, and nothing is shown. */
  recall: RunRecallDto | null;
}

/**
 * What the coach was handed from earlier runs: how many lessons, and — on
 * request — each one in the curator's words with the part of the prompt it
 * serves and, when the lesson was learned somewhere unlike this prompt, what
 * to keep in mind about it. Settled recalls only: while the loop is still recalling, the
 * panel's progress line says so. Only the coach saw these; the grade did not.
 */
export function RecalledLessons({ recall }: RecalledLessonsProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (recall === null || recall.status === 'recalling') return null;

  if (recall.status !== 'recalled') {
    // Empty and skipped always carry their reason; the contract has no other kind.
    return recall.reason === null ? null : (
      <Text size="sm" tone="muted" data-testid="coach-recall" data-status={recall.status}>
        {WITHOUT_COPY[recall.reason]}
      </Text>
    );
  }

  const count = recall.lessons.length;
  return (
    <Stack gap={2} data-testid="coach-recall" data-status="recalled">
      <Stack direction="row" gap={3} align="center" wrap>
        <Text as="span" size="sm" tone="secondary" data-testid="coach-recall-summary">
          {`Recalled ${count} ${count === 1 ? 'lesson' : 'lessons'} from earlier runs for the coach`}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((shown) => !shown)}
          data-testid="coach-recall-toggle"
        >
          {open ? 'Hide lessons' : 'Show lessons'}
        </Button>
      </Stack>
      <LessonList id={listId} hidden={!open} data-testid="coach-recall-lessons">
        {recall.lessons.map((lesson) => (
          <LessonItem key={lesson.ref} data-testid="coach-recall-lesson">
            <WrappingText as="span" size="sm">
              {lesson.insight}
            </WrappingText>
            <WrappingText as="span" size="sm" tone="muted" data-testid="coach-recall-serves">
              {`${LESSON_LABEL.serves}: ${lesson.serves}`}
            </WrappingText>
            {lesson.caveat ? (
              <WrappingText as="span" size="sm" tone="muted" data-testid="coach-recall-caveat">
                {`${LESSON_LABEL.caveat}: ${lesson.caveat}`}
              </WrappingText>
            ) : null}
          </LessonItem>
        ))}
      </LessonList>
    </Stack>
  );
}
