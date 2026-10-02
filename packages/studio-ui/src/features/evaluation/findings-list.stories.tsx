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
        locations: [
          { ref: 'binding.2', label: 'c3 ← n-3', part: 'binding', key: 'c3' },
          { ref: 'node.3', label: 'n-3 · database · Orders DB', part: 'node', key: 'n-3' },
        ],
        nodeIds: ['n-3'],
        locationRefs: ['binding.2', 'node.3'],
        rationale:
          'binding.2 says a replica keeps reads under budget, but node.3 is the only store drawn.',
        reconciledTo: 'c3',
      }),
      makeFinding({
        id: 'operability_gap|node.2',
        lenses: ['critic.architecture'],
        type: 'operability_gap',
        severity: 'info',
        criterionIds: [],
        locations: [
          { ref: 'node.2', label: 'n-2 · service · Order Service', part: 'node', key: 'n-2' },
        ],
        nodeIds: ['n-2'],
        locationRefs: ['node.2'],
        // A place the rationale only mentions reads by its label, but is no chip of the finding's.
        mentions: [{ ref: 'edge.2', label: 'e-2 · n-2 → n-3 (sync)', part: 'edge', key: 'e-2' }],
        rationale:
          'Nothing watches node.2, or the calls it makes along edge.2; the goal asks for observability.',
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
