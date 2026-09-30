import { SEVERITIES } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeCriteria, makeFinding } from '../../testing/fixtures';
import { FindingsList } from './findings-list';

const meta: Meta<typeof FindingsList> = {
  title: 'Studio/Evaluation/FindingsList',
  component: FindingsList,
  args: { criteria: makeCriteria(), onSelect: () => undefined },
};
export default meta;

type Story = StoryObj<typeof FindingsList>;

/** A clean sheet. */
export const Empty: Story = { args: { findings: [] } };

/** The common case: defects from several lenses, one about the story rather than the boxes. */
export const CompleteWithFindings: Story = {
  args: {
    findings: [
      makeFinding({ lenses: ['critic.architecture', 'critic.scenarios'] }),
      makeFinding({
        id: 'unbacked_claim|binding.2',
        lenses: ['critic.explanation'],
        type: 'unbacked_claim',
        severity: 'medium',
        criterionIds: ['c3'],
        nodeIds: ['n-3'],
        locationRefs: ['binding.2', 'node.3'],
        rationale:
          'The brief says a replica keeps reads under budget, but the canvas draws no replica.',
        reconciledTo: 'c3',
      }),
      makeFinding({
        id: 'operability_gap|node.2',
        lenses: ['critic.architecture'],
        type: 'operability_gap',
        severity: 'info',
        criterionIds: [],
        nodeIds: ['n-2'],
        locationRefs: ['node.2'],
        rationale: 'Nothing watches the service; the goal asks for observability.',
      }),
    ],
  },
};

/** One finding per severity, proving the urgency ordering and chip colors. */
export const AllSeverities: Story = {
  args: {
    findings: SEVERITIES.map((severity) =>
      makeFinding({ id: `finding-${severity}`, severity, locationRefs: ['node.3'] }),
    ),
  },
};
