import { Alert } from '@sysdesign/design-system';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FailureDetail } from './failure-detail';

const meta: Meta<typeof FailureDetail> = {
  title: 'Studio/Evaluation/FailureDetail',
  component: FailureDetail,
  args: {
    detail: "the run's heartbeat went stale — the process that owned it died or stalled",
  },
  decorators: [
    (Story) => (
      <Alert tone="danger" title="Grading stopped unexpectedly">
        <span>This revision was not graded. Grade it again — the revision stays as it is.</span>
        <Story />
      </Alert>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FailureDetail>;

/** Folded: the author's sentence leads, the run's own error is one click down. */
export const Folded: Story = {};

/** Opened: the operator's line, verbatim, wrapping inside the dock. */
export const Opened: Story = { args: { defaultOpen: true } };
