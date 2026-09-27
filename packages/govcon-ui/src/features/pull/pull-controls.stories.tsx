import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { PROFILE } from '../../testing/fixtures';
import { PullControls } from './pull-controls';

const meta: Meta<typeof PullControls> = {
  title: 'Govcon/PullControls',
  component: PullControls,
  args: {
    profiles: [PROFILE],
    value: { profileId: PROFILE.id, days: 3 },
    onChange: fn(),
    onPull: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof PullControls>;

/** Ready: a profile, three days, the button. */
export const Default: Story = {};

/** A pull in flight: the form waits. */
export const Pulling: Story = { args: { pulling: true } };

/** No key in the environment: the button stays off and says why. */
export const SourceDisabled: Story = {
  args: { sourceDisabledReason: 'SAM_GOV_API_KEY is not set (no-key)' },
};
