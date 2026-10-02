import { describeUnassessedBase } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  makeFinding,
  makeHeartbeat,
  makeImproveIteration,
  makeImproveRun,
  makeRecall,
  makeRevisionSummary,
} from '../../testing/fixtures';
import { ImprovementPanel } from './improvement-panel';

const meta: Meta<typeof ImprovementPanel> = {
  title: 'Studio/Coach/ImprovementPanel',
  component: ImprovementPanel,
  args: {
    run: null,
    error: null,
    isPolling: false,
    message: '',
    availability: { status: 'reachable', model: 'claude', heartbeat: makeHeartbeat() },
    onStart: () => undefined,
    onLoadRevision: () => undefined,
  },
};
export default meta;

type Story = StoryObj<typeof ImprovementPanel>;

/** Idle, a model available: pick the iterations and hand over the draft. */
export const Idle: Story = {};

/** The quality loop cannot be reached — the button is off and says why. */
export const Unavailable: Story = {
  args: { availability: { status: 'unreachable' } },
};

/** Availability still being asked — the button waits without a reason. */
export const Checking: Story = {
  args: { availability: { status: 'checking' } },
};

/** Mid-run: model calls ticking up, one iteration already imported. */
export const Running: Story = {
  args: {
    run: makeImproveRun({
      exchangeCount: 9,
      iterations: [
        makeImproveIteration({
          iteration: 1,
          mode: 'provided',
          overall: 64,
          decision: 'revise',
          revisionId: 'rev-1',
        }),
        makeImproveIteration({
          iteration: 2,
          mode: 'revise',
          overall: 72,
          decision: 'revise',
          revisionId: 'rev-2',
        }),
      ],
    }),
    isPolling: true,
    message: 'Coaching — 9 model calls so far.',
  },
};

/** Stopped on a plateau with an accepted design to load. */
export const Stopped: Story = {
  args: {
    run: makeImproveRun({
      status: 'complete',
      stopReason: 'plateau',
      exchangeCount: 22,
      iterations: [
        makeImproveIteration({
          iteration: 1,
          mode: 'provided',
          overall: 64,
          decision: 'revise',
          revisionId: 'rev-1',
        }),
        makeImproveIteration({
          iteration: 2,
          mode: 'revise',
          overall: 72,
          decision: 'revise',
          revisionId: 'rev-2',
        }),
        makeImproveIteration({
          iteration: 3,
          mode: 'revise',
          overall: 70,
          decision: 'revise',
          // The reason cites the finding by its key; the row names it by its type and place.
          reason: 'blockers to fix: unhandled_failure|node.3',
          decisionBasis: {
            factor: 'policy-allowed',
            remediations: 1,
            criteria: { assessed: 5, total: 5 },
          },
          findings: [makeFinding()],
          revisionId: null,
        }),
      ],
    }),
    message: 'Coach finished — best score 72.',
  },
};

/** An iteration the studio would not store: accepted by the loop, refused here, and it says why. */
export const Refused: Story = {
  args: {
    run: makeImproveRun({
      status: 'complete',
      stopReason: 'accepted',
      exchangeCount: 14,
      iterations: [
        makeImproveIteration({ iteration: 1, overall: 64, decision: 'revise' }),
        makeImproveIteration({
          iteration: 2,
          overall: 83,
          decision: 'accept',
          reason: 'overall 83 ≥ 75',
          decisionBasis: {
            factor: 'accept-threshold',
            remediations: 0,
            criteria: { assessed: 5, total: 5 },
          },
          outcome: 'refused',
          problems: [
            'binding c2 names node n-9, which the canvas does not draw',
            'narration c4 cites edge e-7, which the canvas does not draw',
          ],
          revisionId: null,
        }),
      ],
    }),
    message: 'Coach finished — best score 83.',
  },
};

/** Started from a graded revision: iteration 1 reuses that grade instead of grading again. */
export const FromGradedRevision: Story = {
  args: {
    run: makeImproveRun({
      exchangeCount: 3,
      iterations: [
        makeImproveIteration({ iteration: 1, mode: 'adopted', overall: 72, decision: 'revise' }),
      ],
    }),
    isPolling: true,
    message: 'Coaching — 3 model calls so far.',
  },
};

/** The run failed outright. */
export const Failed: Story = {
  args: {
    run: makeImproveRun({ status: 'failed', error: 'the producer refused', iterations: [] }),
    error: 'the producer refused',
    message: 'The coach stopped unexpectedly.',
  },
};

/** The run failed, and an earlier run's best is still offered. */
export const FailedWithEarlierBest: Story = {
  args: {
    ...Failed.args,
    earlierBest: makeRevisionSummary({
      id: 'rev-4',
      revisionNumber: 4,
      origin: 'assistant',
      evaluation: {
        runId: 'run-1',
        iteration: 2,
        status: 'complete',
        overall: 80,
        decision: 'accept',
      },
    }),
  },
};

/** The coach produced nothing to judge: unscored, and the stop says it was the coach's miss. */
export const NoArtifact: Story = {
  args: {
    run: makeImproveRun({
      status: 'complete',
      stopReason: 'escalated',
      iterations: [
        makeImproveIteration({ iteration: 1, overall: 12.1 }),
        makeImproveIteration({
          iteration: 2,
          mode: 'revise',
          overall: null,
          decision: 'escalate',
          reason: 'no artifact to judge',
          outcome: 'no-artifact',
          revisionId: null,
        }),
      ],
    }),
  },
};

/** Minutes before the story rendered — the clock-relative values, for a run that is live now. */
const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/** Live, and quiet too long: the run's last sign of life is minutes old, and the panel says so instead of spinning. */
export const GraderGoneQuiet: Story = {
  args: {
    run: makeImproveRun({
      exchangeCount: 5,
      startedAt: minutesAgo(9),
      heartbeatAt: minutesAgo(4),
      readAt: minutesAgo(0),
      iterations: [
        makeImproveIteration({ iteration: 1, mode: 'provided', overall: 64, decision: 'revise' }),
      ],
    }),
    isPolling: true,
    message: 'Coaching — iteration 2 of 3, 5 model calls so far.',
  },
};

/** A grade holds the session: the coach is off, in the session's own words. */
export const BlockedByGrade: Story = {
  args: {
    blockedReason: 'Revision #2 is still being graded — wait for its verdict.',
  },
};

/** Just started: the loop is recalling lessons from earlier runs before the coach revises anything. */
export const Recalling: Story = {
  args: {
    run: makeImproveRun({
      exchangeCount: 1,
      iterations: [],
      recall: makeRecall({ status: 'recalling', count: 0, lessons: [], recallRunId: null }),
    }),
    isPolling: true,
    message: 'Coaching — recalling lessons from earlier runs for the coach.',
  },
};

/** The coach was handed two lessons from earlier runs; the list opens on request. */
export const RecalledLessons: Story = {
  args: {
    run: makeImproveRun({
      status: 'complete',
      stopReason: 'max-iterations',
      recall: makeRecall(),
      iterations: [
        makeImproveIteration({ iteration: 1, mode: 'provided', overall: 64, decision: 'revise' }),
        makeImproveIteration({
          iteration: 2,
          mode: 'revise',
          overall: 72,
          decision: 'revise',
          outcome: 'imported',
          revisionId: 'rev-2',
        }),
      ],
    }),
  },
};

/** Started from a graded revision: the lessons were searched for what its grade found wrong, and the panel says so beside them. */
export const RecalledForItsDefects: Story = {
  args: {
    run: makeImproveRun({
      status: 'complete',
      stopReason: 'max-iterations',
      recall: makeRecall({
        focus: {
          runId: 'run-1',
          iteration: 2,
          findings: [
            { type: 'unhandled_failure', severity: 'high', rationale: 'one replica serves reads' },
            { type: 'scale_mismatch', severity: 'medium', rationale: null },
          ],
          criteria: [{ criterionId: 'c4', statement: 'p99 redirect under 50 ms', result: 'fail' }],
        },
      }),
      iterations: [
        makeImproveIteration({ iteration: 1, mode: 'adopted', overall: 58, decision: 'revise' }),
      ],
    }),
  },
};

/** The revision on the canvas was not assessed: there is no grade to start from, and the coach says so. */
export const BaseNotAssessed: Story = {
  args: { blockedReason: describeUnassessedBase(1) },
};

/** Recall could not run — no lesson store reachable — and the coach went on without lessons. */
export const RecallSkipped: Story = {
  args: {
    run: makeImproveRun({
      status: 'complete',
      stopReason: 'max-iterations',
      recall: makeRecall({
        status: 'skipped',
        reason: 'store-unavailable',
        note: 'connect ECONNREFUSED',
        count: 0,
        lessons: [],
        recallRunId: null,
      }),
    }),
  },
};
