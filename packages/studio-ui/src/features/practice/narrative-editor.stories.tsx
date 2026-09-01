import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeGraph } from '../../testing/fixtures';
import { withCanvasStore } from '../../testing/story-decorators';
import { NarrativeEditor } from './narrative-editor';

const meta: Meta<typeof NarrativeEditor> = {
  title: 'Studio/Practice/NarrativeEditor',
  component: NarrativeEditor,
};
export default meta;

type Story = StoryObj<typeof NarrativeEditor>;

/** A blank draft, with the advisory caption doing the honest work. */
export const Empty: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};

/** A short walkthrough. Length is counted, never graded. */
export const ShortDraft: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadNarrative('The Client places orders through the Order Service.');
    }),
  ],
};

/** A fuller walkthrough — still unscored; the brief is what earns the grade. */
export const FullDraft: Story = {
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
