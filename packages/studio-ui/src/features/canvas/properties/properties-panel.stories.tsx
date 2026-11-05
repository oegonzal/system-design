import type { Meta, StoryObj } from '@storybook/react-vite';

import { PLATFORM_IDS, platformCatalogue } from '@sysdesign/contracts';

import { makeGraph, makeInterfaceGraph, makePlatformGraph } from '../../../testing/canvas-fixtures';
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

/** A database selected: label, kind, its one typed config entry, an empty interface. */
export const DatabaseSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().select('n-3');
    }),
  ],
};

/** A cache with free-form config of every type. */
export const CacheSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().updateNode('n-2', {
        kind: 'cache',
        label: 'Hot Cache',
        config: [
          { key: 'strategy', value: 'cache-aside' },
          { key: 'ttlSeconds', value: 60 },
          { key: 'invalidation', value: true },
        ],
      });
      store.getState().select('n-2');
    }),
  ],
};

/** A service with the full interface block: responsibilities and operations. */
export const ServiceInterfaceSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeInterfaceGraph());
      store.getState().select('n-3');
    }),
  ],
};

/** A block that is a platform service: the Service control, the roles it plays, its guide and its knobs as chips. */
export const ServiceSelected: Story = {
  args: { catalogue: platformCatalogue(PLATFORM_IDS[0]) },
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makePlatformGraph());
      store.getState().select('n-4');
    }),
  ],
};

/** An async hop with its config declared and the hop keys offered as chips. */
export const EdgeConfigSelected: Story = {
  args: { catalogue: platformCatalogue(PLATFORM_IDS[0]) },
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makePlatformGraph());
      store.getState().select('e-3');
    }),
  ],
};

/** An edge selected: sync/async toggle, label, and carries with nothing declared. */
export const EdgeSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().select('e-2');
    }),
  ],
};

/** A call edge whose carries resolve against both endpoints' declared operations. */
export const EdgeCarriesSelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeInterfaceGraph());
      store.getState().select('e-2');
    }),
  ],
};

/** A carry that outlived its declaration: the stale chip. */
export const EdgeStaleCarrySelected: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeInterfaceGraph());
      store.getState().updateEdge('e-2', { carries: ['PlaceOrder', 'chargeCard'] });
      store.getState().select('e-2');
    }),
  ],
};

/** A revision on screen: the service can be inspected, and every control is disabled. */
export const ReadOnly: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeInterfaceGraph());
      store.getState().select('n-3');
      store.getState().setReadOnly(true);
    }),
  ],
};
