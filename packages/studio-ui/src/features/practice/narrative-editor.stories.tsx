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

const RATIONALE =
  'The Orders DB owns the write path and is the source of truth every read reconciles against.';
const FLOW =
  'The client reads seat availability from the service, which serves it from the cache and falls back to the database.';

/** A blank draft — every slot reads "Not written". */
export const Empty: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};

/** Some slots explained, some still thin or blank — the live verdicts differ. */
export const PartiallyExplained: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadNarrative({
        version: 1,
        overview: 'A read/write split keeps order lookups fast while writes stay strongly ordered.',
        componentRationales: [
          { nodeId: 'n-3', prose: RATIONALE },
          { nodeId: 'n-2', prose: 'routes requests' },
        ],
        flowNarrations: [],
      });
    }),
  ],
};

/** Every component and requirement narrated — the state a top grade needs. */
export const FullyExplained: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadNarrative({
        version: 1,
        overview: 'A read/write split keeps order lookups fast while writes stay strongly ordered.',
        componentRationales: [
          {
            nodeId: 'n-1',
            prose: 'The client is where a shopper reads status and places an order.',
          },
          {
            nodeId: 'n-2',
            prose: 'The order service owns the order lifecycle and validates each write.',
          },
          { nodeId: 'n-3', prose: RATIONALE },
        ],
        flowNarrations: [
          { requirementIndex: 0, prose: FLOW },
          { requirementIndex: 1, prose: FLOW },
          { requirementIndex: 2, prose: FLOW },
        ],
      });
    }),
  ],
};
