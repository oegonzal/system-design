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

/** An improving trail — newest chip first. */
export const ImprovingTrail: Story = {
  args: {
    revisions: [
      makeRevisionSummary({ id: 'rev-1', revisionNumber: 1, grade: 'D', overallScore: 41 }),
      makeRevisionSummary({ id: 'rev-2', revisionNumber: 2, grade: 'C', overallScore: 58 }),
      makeRevisionSummary({ id: 'rev-3', revisionNumber: 3, grade: 'B', overallScore: 74 }),
      makeRevisionSummary({
        id: 'rev-4',
        revisionNumber: 4,
        grade: null,
        overallScore: null,
        evaluationStatus: 'queued',
      }),
    ],
    activeRevisionId: 'rev-3',
  },
};
