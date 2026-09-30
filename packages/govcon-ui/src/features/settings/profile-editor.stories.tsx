import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { PROFILE } from '../../testing/fixtures';
import { ProfileEditor } from './profile-editor';
import { PROFILE_TEMPLATE } from './profile-template';

const meta: Meta<typeof ProfileEditor> = {
  title: 'Govcon/Settings/ProfileEditor',
  component: ProfileEditor,
  args: { value: PROFILE, onChange: fn(), mode: 'edit', onSave: fn(), onCancel: fn() },
};
export default meta;

type Story = StoryObj<typeof ProfileEditor>;

/** The shipped profile, every part of it a field. */
export const Default: Story = {};

/** A new profile from the template: the id is typed, the codes are empty. */
export const Creating: Story = { args: { value: PROFILE_TEMPLATE, mode: 'create' } };

/** The service refused the save: each issue beside its field, all of them at the top. */
export const WithIssues: Story = {
  args: {
    value: {
      ...PROFILE,
      scoring: { ...PROFILE.scoring, weights: { ...PROFILE.scoring.weights, naics: 0.5 } },
      naics: ['33271A', '5415'],
    },
    issues: [
      { path: 'scoring.weights', message: 'weights sum to 1.2, not 1' },
      { path: 'naics.0', message: 'Invalid string: must match pattern /^\\d{2,6}$/' },
    ],
  },
};

/** In flight. */
export const Saving: Story = { args: { saving: true } };
