import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeCriteria, makeEvaluation, makeFinding } from '../../testing/fixtures';
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
      dimensions: {},
    }),
  },
};

/** A revise whose blockers are named as their records name them, and two lens samples that answered nothing. */
export const BlockersAndMissingLenses: Story = {
  args: {
    criteria: makeCriteria(),
    evaluation: makeEvaluation({
      overall: 12.1,
      decisionReason: 'blockers to fix: contradiction|binding.2,edge.5,narration.2, c3',
      findings: [
        makeFinding({
          id: 'contradiction|binding.2,edge.5,narration.2',
          type: 'contradiction',
          locations: [
            { ref: 'binding.2', label: 'c2 binding (n-3)', part: 'binding', key: 'c2' },
            { ref: 'edge.5', label: 'e-5 · n-2 → n-3 (sync)', part: 'edge', key: 'e-5' },
            { ref: 'narration.2', label: 'c2 narration', part: 'narration', key: 'c2' },
          ],
          locationRefs: ['binding.2', 'edge.5', 'narration.2'],
        }),
      ],
      degraded: [
        { stage: 'critic.scale', sample: 1, reason: 'llm-failed' },
        { stage: 'evaluator.quality', sample: 2, reason: 'token-clipped' },
      ],
    }),
  },
};

/** The revision a coaching run ended on: the grade says why the coach stopped, in the coach's words. */
export const CoachStoppedHere: Story = {
  args: {
    evaluation: makeEvaluation({ iteration: 3, overall: 68, stopReason: 'plateau' }),
  },
};

/** A rejected design — every meter in the danger band. */
export const Reject: Story = {
  args: {
    evaluation: makeEvaluation({
      overall: 22,
      decision: 'reject',
      dimensions: { coverage: 15, quality_attributes: 20, compliance: 30 },
    }),
  },
};
