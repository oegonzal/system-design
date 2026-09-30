import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeEvaluation } from '../../testing/fixtures';
import { ScoreSummary } from './score-summary';

const meta: Meta<typeof ScoreSummary> = {
  title: 'Studio/Evaluation/ScoreSummary',
  component: ScoreSummary,
};
export default meta;

type Story = StoryObj<typeof ScoreSummary>;

/** A middling revise — the meters show the auto danger/warn/success bands. */
export const Revise: Story = { args: { evaluation: makeEvaluation() } };

/** An accepted design. */
export const Accept: Story = {
  args: {
    evaluation: makeEvaluation({
      overall: 91,
      decision: 'accept',
      stopReason: 'accepted',
      dimensions: { coverage: 95, quality_attributes: 88, compliance: 100 },
    }),
  },
};

/** A dimension the loop never assessed reads "Not assessed". */
export const NotAssessed: Story = {
  args: {
    evaluation: makeEvaluation({
      overall: 81,
      dimensions: { coverage: 84, quality_attributes: null, compliance: 79 },
    }),
  },
};

/** The loop escalated without a score — no meters, no number. */
export const Escalated: Story = {
  args: {
    evaluation: makeEvaluation({
      overall: null,
      decision: 'escalate',
      stopReason: 'escalated',
      dimensions: {},
    }),
  },
};

/** A rejected design — every meter in the danger band. */
export const Reject: Story = {
  args: {
    evaluation: makeEvaluation({
      overall: 22,
      decision: 'reject',
      stopReason: 'rejected',
      dimensions: { coverage: 15, quality_attributes: 20, compliance: 30 },
    }),
  },
};
