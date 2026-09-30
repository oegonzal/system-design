import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { OTHER_PROFILE, PROFILE } from '../../testing/fixtures';
import { ProfileList } from './profile-list';

const meta: Meta<typeof ProfileList> = {
  title: 'Govcon/Settings/ProfileList',
  component: ProfileList,
  args: {
    profiles: [PROFILE, OTHER_PROFILE],
    activeId: 'enfav',
    onSelect: fn(),
    onNew: fn(),
    onCopy: fn(),
    onSetDefault: fn(),
    onDelete: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof ProfileList>;

/** Two profiles, the default open in the editor. */
export const Default: Story = {};

/** One profile only: it cannot be removed. */
export const Single: Story = { args: { profiles: [PROFILE] } };
