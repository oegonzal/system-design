import type { Meta, StoryObj } from '@storybook/react-vite';

import { PROFILE } from '../../testing/fixtures';
import { ProfileSummary } from './profile-summary';

const meta: Meta<typeof ProfileSummary> = {
  title: 'Govcon/ProfileSummary',
  component: ProfileSummary,
  args: { profile: PROFILE },
};
export default meta;

type Story = StoryObj<typeof ProfileSummary>;

/** The shipped profile, as the scorer reads it. */
export const Default: Story = {};
