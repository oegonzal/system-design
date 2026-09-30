import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeBrief, makeCriteria, makeGraph } from '../../../testing/fixtures';
import { withCanvasStore } from '../../../testing/story-decorators';
import { DesignBriefEditor } from './design-brief-editor';

const meta: Meta<typeof DesignBriefEditor> = {
  title: 'Studio/Practice/DesignBriefEditor',
  component: DesignBriefEditor,
  args: { criteria: makeCriteria() },
};
export default meta;

type Story = StoryObj<typeof DesignBriefEditor>;

/** Nothing claimed yet: every criterion unbound, every component unaccounted for. */
export const Empty: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};

/** Two criteria bound — one with a traced path — and one half-typed. */
export const PartiallyBound: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadBrief(makeBrief());
      store.getState().setBindingClaim('c5', 'Webhooks land on the service');
    }),
  ],
};

/** The rubric is still being derived — nothing to bind against yet. */
export const Normalizing: Story = {
  args: { criteria: [], deriving: true },
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};
