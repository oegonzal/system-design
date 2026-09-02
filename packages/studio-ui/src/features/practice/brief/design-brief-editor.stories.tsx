import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  makeGraph,
  makeOrderHistoryGraph,
  makePrompt,
  makeWorkflowPrompt,
} from '../../../testing/fixtures';
import { withCanvasStore } from '../../../testing/story-decorators';
import { DesignBriefEditor } from './design-brief-editor';

const meta: Meta<typeof DesignBriefEditor> = {
  title: 'Studio/Practice/DesignBriefEditor',
  component: DesignBriefEditor,
  args: { prompt: makePrompt() },
};
export default meta;

type Story = StoryObj<typeof DesignBriefEditor>;

/** Nothing claimed yet: every requirement unbound, every flow untraced. */
export const Empty: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
};

/**
 * A claim the diagram cannot back up. The fixture database declares only
 * `replicas`, so `backups` is eligible but unproven — the state the editor
 * must show plainly and still allow, because the finding is the lesson.
 */
export const Uncorroborated: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadBrief({
        version: 1,
        nfrBindings: [{ nfrId: 'fst-avail-sale-window', mechanism: 'backups', nodeIds: ['n-3'] }],
        flows: [],
      });
    }),
  ],
};

/** The same claim against a database that actually declares backups. */
export const Corroborated: Story = {
  decorators: [
    withCanvasStore((store) => {
      const graph = makeGraph();
      store.getState().setGraph({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === 'n-3' ? { ...node, config: { ...node.config, backups: true } } : node,
        ),
      });
      store.getState().loadBrief({
        version: 1,
        nfrBindings: [{ nfrId: 'fst-avail-sale-window', mechanism: 'backups', nodeIds: ['n-3'] }],
        flows: [],
      });
    }),
  ],
};

/** A request traced client → service → database, which is what earns the flow. */
export const FlowTraced: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadBrief({
        version: 1,
        nfrBindings: [],
        flows: [{ id: 'flow-0', requirementIndex: 0, path: ['e-1', 'e-2'] }],
      });
    }),
  ],
};

/**
 * A machine proposal awaiting an answer. Dashed and tinted like every other
 * not-yet-real thing in this app, carrying the same verdict chip the author's
 * own bindings carry — the fixture database declares no backups, so the model's
 * claim shows as uncorroborated and accepting it would cost marks.
 */
export const ProposalPending: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().loadProposals([
        {
          nfrId: 'fst-avail-sale-window',
          mechanism: 'backups',
          nodeIds: ['n-3'],
          rationale: 'The orders database is where the durable state lives.',
        },
      ]);
    }),
  ],
};

/** A proposal that would overwrite a binding the author already made. */
export const ProposalReplacesABinding: Story = {
  decorators: [
    withCanvasStore((store) => {
      store.getState().setGraph(makeGraph());
      store.getState().setBindingMechanism('fst-avail-sale-window', 'failover');
      store.getState().toggleBindingNode('fst-avail-sale-window', 'n-3');
      store.getState().loadProposals([
        {
          nfrId: 'fst-avail-sale-window',
          mechanism: 'backups',
          nodeIds: ['n-3'],
          rationale: 'Backups protect the sale window better than failover here.',
        },
      ]);
    }),
  ],
};

/** A workflow prompt with a blank canvas: every chip reads Not started — the silence that scores 0. */
export const WorkflowNothingClaimed: Story = {
  args: { prompt: makeWorkflowPrompt() },
  decorators: [withCanvasStore()],
};

/** The order-history graph covers the query and push path; the pull path is still missing. */
export const WorkflowPartialCoverage: Story = {
  args: { prompt: makeWorkflowPrompt() },
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeOrderHistoryGraph()))],
};
