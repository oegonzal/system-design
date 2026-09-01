import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeGraph, makePrompt } from '../../testing/fixtures';
import { withCanvasStore } from '../../testing/story-decorators';
import { NarrativeEditor } from './narrative-editor';

const meta: Meta<typeof NarrativeEditor> = {
  title: 'Studio/Practice/NarrativeEditor',
  component: NarrativeEditor,
  args: { prompt: makePrompt() },
};
export default meta;

type Story = StoryObj<typeof NarrativeEditor>;

/** A blank draft against a small diagram — every label still unmentioned. */
export const Empty: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};

/** A partial draft: the checklist tracks what the prose has not covered yet. */
export const PartiallyCovered: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadNarrative('The Client places orders through the Order Service.');
    }),
  ],
};

/** Every component mentioned — the subtle all-covered line. */
export const FullyCovered: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store
        .getState()
        .loadNarrative(
          'The Client calls the Order Service, which persists every order in the Orders DB.',
        );
    }),
  ],
};
