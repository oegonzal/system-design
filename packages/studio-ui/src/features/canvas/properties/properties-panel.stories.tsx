import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeGraph } from '../../../testing/fixtures';
import { withCanvasStore } from '../../../testing/story-decorators';
import { PropertiesPanel } from './properties-panel';

const meta: Meta<typeof PropertiesPanel> = {
  title: 'Studio/Canvas/PropertiesPanel',
  component: PropertiesPanel,
};
export default meta;

type Story = StoryObj<typeof PropertiesPanel>;

/** Nothing selected — the empty state. */
export const Empty: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};

/** A database selected: label, kind, and the replicas knob the rules read. */
export const DatabaseSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().select('n-3');
    }),
  ],
};

/** A cache selected: strategy + TTL sub-form. */
export const CacheSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().updateNode('n-2', {
        kind: 'cache',
        label: 'Hot Cache',
        config: { strategy: 'cache-aside', ttlSeconds: 60 },
      });
      store.getState().select('n-2');
    }),
  ],
};

/** An edge selected: sync/async toggle and label. */
export const EdgeSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().select('e-2');
    }),
  ],
};
