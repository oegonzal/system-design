import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeExperience, makePrompt, makeStory } from '../../testing/fixtures';
import { StoryForm } from './story-form';

const meta: Meta<typeof StoryForm> = {
  title: 'Studio/Stories/StoryForm',
  component: StoryForm,
  args: {
    onSave: () => undefined,
    prompts: [makePrompt()],
    experiences: [makeExperience()],
  },
};
export default meta;

type Story = StoryObj<typeof StoryForm>;

/** Blank create form — save stays disabled until STAR is complete. */
export const Create: Story = {};

/** Editing an existing story, delete available. */
export const Edit: Story = {
  args: {
    initial: makeStory(),
    onDelete: () => undefined,
  },
};

/** Mid-save: the button reads Saving… and locks. */
export const Saving: Story = {
  args: {
    initial: makeStory(),
    saving: true,
  },
};
