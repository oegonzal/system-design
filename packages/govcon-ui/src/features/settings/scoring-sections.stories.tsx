import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { PROFILE } from '../../testing/fixtures';
import { ScoringSections } from './scoring-sections';

const meta: Meta<typeof ScoringSections> = {
  title: 'Govcon/Settings/ScoringSections',
  component: ScoringSections,
  args: { scoring: PROFILE.scoring, onChange: fn(), issues: [], disabled: false },
};
export default meta;

type Story = StoryObj<typeof ScoringSections>;

/** The shipped policy: weights that sum to 1, and every price and band a field. */
export const Default: Story = {};

/** Weights that miss 1, and the service's word on it beside them. */
export const OffBalance: Story = {
  args: {
    scoring: { ...PROFILE.scoring, weights: { ...PROFILE.scoring.weights, naics: 0.5 } },
    issues: [{ path: 'scoring.weights', message: 'weights sum to 1.2, not 1' }],
  },
};

/** In flight: nothing can be changed. */
export const Disabled: Story = { args: { disabled: true } };
