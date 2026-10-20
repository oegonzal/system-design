/**
 * Builders the interview-turn specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig. The goal is shaped
 * as the studio composes one: the notes, the rubric with ids, the transcript,
 * the items, and the index the validators read.
 */
import {
  renderIndexSection,
  type InterviewIndex,
  type InterviewTurnOutput,
} from '@sysdesign/contracts';

export const sampleIndex = (): InterviewIndex => ({
  items: [
    { id: 'question.1', kind: 'question' },
    { id: 'question.2', kind: 'question' },
  ],
  criterionIds: ['c1', 'c2', 'c3'],
});

export const sampleInterviewGoal = (index: InterviewIndex = sampleIndex()): string =>
  [
    '# Interview: Serve an order history',
    '',
    '## Interviewer notes',
    '',
    '# Serve an order history',
    '',
    'Shoppers expect one list of their orders, newest first.',
    '',
    '## Functional requirements',
    '',
    '1. Return a customer’s past orders newest first.',
    '2. Ingest online orders as the storefront pushes them.',
    '',
    '## Non-functional requirements',
    '',
    '| Kind | Requirement | Target |',
    '| --- | --- | --- |',
    '| latency | Order-history reads | p99 ≤ 300 ms |',
    '',
    '## Rubric',
    '',
    '- c1 (functional): Past orders are returned newest first with line items.',
    '- c2 (functional): Online orders are ingested as pushed.',
    '- c3 (non_functional): Order-history reads answer within p99 300 ms.',
    '',
    '## Transcript so far',
    '',
    '(none yet)',
    '',
    '## Items to address',
    '',
    '[question.1] How fast do reads need to be?',
    '[question.2] Do we need to support returns?',
    '',
    renderIndexSection(index),
  ].join('\n');

export const sampleTurn = (overrides: Partial<InterviewTurnOutput> = {}): InterviewTurnOutput => ({
  replies: [
    {
      to: 'question.1',
      text: 'Reads should answer within 300 milliseconds at the 99th percentile.',
      disclosesCriterionIds: ['c3'],
    },
    {
      to: 'question.2',
      text: 'The problem does not specify returns; state an assumption and go on.',
      disclosesCriterionIds: [],
    },
  ],
  ...overrides,
});

/** The sample with a design given away in the second reply — what the conduct critic exists to catch. */
export const leakedTurn = (): InterviewTurnOutput =>
  sampleTurn({
    replies: [
      ...sampleTurn().replies.slice(0, 1),
      {
        to: 'question.2',
        text: 'No returns; you could keep a read model per customer fed by a queue.',
        disclosesCriterionIds: [],
      },
    ],
  });
