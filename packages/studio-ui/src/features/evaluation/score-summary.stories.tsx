import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeEvaluation } from '../../testing/fixtures';
import { ScoreSummary } from './score-summary';

const meta: Meta<typeof ScoreSummary> = {
  title: 'Studio/Evaluation/ScoreSummary',
  component: ScoreSummary,
};
export default meta;

type Story = StoryObj<typeof ScoreSummary>;

/** A middling grade — the meters show the auto danger/warn/success bands. */
export const GradeB: Story = { args: { evaluation: makeEvaluation() } };

/** A strong pass. */
export const GradeA: Story = {
  args: {
    evaluation: makeEvaluation({
      overallScore: 93,
      grade: 'A',
      summary: 'Well-balanced design; minor hygiene nits only.',
      dimensionScores: {
        reliability: 95,
        scalability: 92,
        performance: 90,
        data: 94,
        messaging: 91,
        security: 96,
        hygiene: 88,
      },
    }),
  },
};

/** A prompt that never examined security or messaging — those rows read "Not assessed". */
export const NotAssessed: Story = {
  args: {
    evaluation: makeEvaluation({
      overallScore: 81,
      grade: 'B',
      summary: 'Strong core; this prompt put nothing on security or messaging.',
      dimensionScores: {
        reliability: 84,
        scalability: 79,
        performance: 82,
        data: 80,
        messaging: null,
        security: null,
        hygiene: 90,
      },
    }),
  },
};

/** A failing design — every meter in the danger band. */
export const GradeF: Story = {
  args: {
    evaluation: makeEvaluation({
      overallScore: 22,
      grade: 'F',
      summary: 'A single box called "backend" is a wish, not a design.',
      dimensionScores: {
        reliability: 15,
        scalability: 20,
        performance: 30,
        data: 25,
        messaging: 10,
        security: 28,
        hygiene: 35,
      },
    }),
  },
};
