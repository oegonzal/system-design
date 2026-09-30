import type { Meta, StoryObj } from '@storybook/react-vite';

import { EXCLUDED_LEAD, makeLead } from '../../testing/fixtures';
import { ScoreTrace } from './score-trace';

const meta: Meta<typeof ScoreTrace> = {
  title: 'Govcon/Notice/ScoreTrace',
  component: ScoreTrace,
  args: { lead: makeLead() },
};
export default meta;

type Story = StoryObj<typeof ScoreTrace>;

/** A high lead with every point traced. */
export const Default: Story = {};

/** A notice a gate removed: no score, the reason instead. */
export const Excluded: Story = { args: { lead: EXCLUDED_LEAD } };
