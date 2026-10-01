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

/** Just saved: "Saved" stands beside the actions until the next edit. */
export const Saved: Story = {
  args: {
    initial: makeStory(),
    saved: true,
  },
};

/** The API refused the save: why, as an alert beside Save. */
export const SaveRefused: Story = {
  args: {
    initial: makeStory(),
    error: 'A story titled “The replica that saved the on-sale” already exists.',
  },
};

/** A tag past the limit: named beside the tags field, and Save says why it is off. */
export const TagTooLong: Story = {
  args: {
    initial: makeStory({ tags: ['postgres', 'a-tag-far-longer-than-any-tag-is-allowed-to-be'] }),
  },
};
