import { SEVERITIES } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeFinding } from '../../testing/fixtures';
import { FindingsList } from './findings-list';

const meta: Meta<typeof FindingsList> = {
  title: 'Studio/Evaluation/FindingsList',
  component: FindingsList,
  args: {
    onSelect: () => undefined,
    onPreviewFix: () => undefined,
  },
};
export default meta;

type Story = StoryObj<typeof FindingsList>;

/** A clean sheet. */
export const Empty: Story = { args: { findings: [] } };

/** The common case: a mix of rule and AI findings, one with a suggested fix. */
export const CompleteWithFindings: Story = {
  args: {
    findings: [
      makeFinding(),
      makeFinding({
        id: 'finding-2',
        source: 'llm',
        ruleId: null,
        dimension: 'messaging',
        severity: 'medium',
        title: 'Order events fan out synchronously',
        message:
          'Every downstream consumer extends checkout latency; an event stream decouples them.',
        suggestion: null,
      }),
      makeFinding({
        id: 'finding-3',
        dimension: 'hygiene',
        severity: 'info',
        ruleId: 'hygiene.unlabeled-edges',
        title: 'Unlabeled connections',
        message: 'Labels turn a diagram into an argument.',
        suggestion: null,
      }),
    ],
  },
};

/** One finding per severity, proving the urgency ordering and chip colors. */
export const AllSeverities: Story = {
  args: {
    findings: SEVERITIES.map((severity, index) =>
      makeFinding({
        id: `finding-${severity}`,
        severity,
        title: `A ${severity} finding`,
        suggestion: index === 0 ? makeFinding().suggestion : null,
      }),
    ),
  },
};
