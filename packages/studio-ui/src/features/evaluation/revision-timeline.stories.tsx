import { describeLostGrade } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeRevisionSummary } from '../../testing/fixtures';
import { RevisionTimeline } from './revision-timeline';

const meta: Meta<typeof RevisionTimeline> = {
  title: 'Studio/Evaluation/RevisionTimeline',
  component: RevisionTimeline,
  args: { onSelect: () => undefined },
};
export default meta;

type Story = StoryObj<typeof RevisionTimeline>;

/** No submissions yet. */
export const Empty: Story = { args: { revisions: [] } };

/** An improving trail — newest chip first, the coach's revision badged, the latest still grading. */
export const ImprovingTrail: Story = {
  args: {
    revisions: [
      makeRevisionSummary({
        id: 'rev-1',
        revisionNumber: 1,
        evaluation: {
          runId: 'run-1',
          iteration: 1,
          status: 'complete',
          overall: 41,
          decision: 'revise',
        },
      }),
      makeRevisionSummary({
        id: 'rev-2',
        revisionNumber: 2,
        origin: 'assistant',
        evaluation: {
          runId: 'run-2',
          iteration: 2,
          status: 'complete',
          overall: 58,
          decision: 'revise',
        },
      }),
      makeRevisionSummary({
        id: 'rev-3',
        revisionNumber: 3,
        evaluation: {
          runId: 'run-3',
          iteration: 1,
          status: 'complete',
          overall: 84,
          decision: 'accept',
        },
      }),
      makeRevisionSummary({
        id: 'rev-4',
        revisionNumber: 4,
        evaluation: {
          runId: 'run-4',
          iteration: 1,
          status: 'running',
          overall: null,
          decision: null,
        },
      }),
    ],
    activeRevisionId: 'rev-3',
    feedbackRevisionId: 'rev-3',
  },
};

/** The canvas shows the draft: no chip is current, and the feedback tab's revision says whose grade is on show. */
export const DraftOnCanvas: Story = {
  args: { ...ImprovingTrail.args, activeRevisionId: null, feedbackRevisionId: 'rev-3' },
};

/** Two grades that never arrived: one the run failed, one the grader lost — the studio's sentence is the chip's title. */
export const GradesThatNeverArrived: Story = {
  args: {
    revisions: [
      makeRevisionSummary({
        id: 'rev-1',
        revisionNumber: 1,
        evaluation: {
          runId: 'run-1',
          iteration: 1,
          status: 'failed',
          overall: null,
          decision: null,
        },
      }),
      makeRevisionSummary({
        id: 'rev-2',
        revisionNumber: 2,
        evaluation: {
          runId: 'run-2',
          iteration: 1,
          status: 'failed',
          overall: null,
          decision: null,
          error: describeLostGrade(2),
        },
      }),
    ],
    activeRevisionId: 'rev-2',
    feedbackRevisionId: 'rev-2',
  },
};

/** A grade the lenses could not settle: "not assessed", never a 0 or its escalation, beside a real grade of the same design. */
export const NotAssessed: Story = {
  args: {
    revisions: [
      makeRevisionSummary({
        id: 'rev-1',
        revisionNumber: 1,
        evaluation: {
          runId: 'run-1',
          iteration: 1,
          status: 'complete',
          overall: null,
          decision: 'escalate',
        },
      }),
      makeRevisionSummary({
        id: 'rev-2',
        revisionNumber: 2,
        evaluation: {
          runId: 'run-2',
          iteration: 1,
          status: 'complete',
          overall: 56,
          decision: 'revise',
        },
      }),
    ],
    activeRevisionId: 'rev-1',
    feedbackRevisionId: 'rev-1',
  },
};
