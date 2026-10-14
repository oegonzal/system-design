import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeCriteria } from '../../testing/fixtures';
import { makeGraph, makeNarrative } from '../../testing/canvas-fixtures';
import { withCanvasStore } from '../../testing/story-decorators';
import { NarrativeEditor } from './narrative-editor';

const meta: Meta<typeof NarrativeEditor> = {
  title: 'Studio/Practice/NarrativeEditor',
  component: NarrativeEditor,
  args: { criteria: makeCriteria() },
};
export default meta;

type Story = StoryObj<typeof NarrativeEditor>;

/** A blank draft — every slot reads "Not written". */
export const Empty: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};

/** The overview, one rationale and one narration written; the rest still blank. */
export const PartiallyWritten: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadNarrative(makeNarrative());
    }),
  ],
};
