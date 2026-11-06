import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeCriteria } from '../../../testing/fixtures';
import {
  makeBinding,
  makeBrief,
  makeGraph,
  makeLifecycleGraph,
} from '../../../testing/canvas-fixtures';
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

/** The way in drawn whole and traced end to end: every stage served, the request at rest. */
export const TracedThroughEveryStage: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeLifecycleGraph());
      store.getState().loadBrief(
        makeBrief({
          bindings: [
            makeBinding({
              nodeIds: ['n-5', 'n-6'],
              path: ['e-1', 'e-2', 'e-3', 'e-4', 'e-5'],
              claim: 'The catalog is read behind the front door, from the edge in',
            }),
          ],
        }),
      );
      store.getState().focusPath('c1');
    }),
  ],
};

/** The rubric is still being derived — nothing to bind against yet. */
export const Normalizing: Story = {
  args: { criteria: [], deriving: true },
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};
