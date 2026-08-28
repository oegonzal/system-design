import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from '../badge/badge';
import { Heading } from '../heading/heading';
import { Stack } from '../stack/stack';
import { Text } from '../text/text';
import { Surface } from './surface';

const meta: Meta<typeof Surface> = {
  title: 'Design System/Primitives/Surface',
  component: Surface,
  argTypes: {
    padding: { control: { type: 'number', min: 0, max: 8, step: 1 } },
    as: { control: 'inline-radio', options: ['div', 'section', 'aside', 'article'] },
  },
};
export default meta;

type Story = StoryObj<typeof Surface>;

export const Card: Story = {
  render: (args) => (
    <Surface {...args}>
      <Stack gap={3}>
        <Stack direction="row" justify="between" align="center">
          <Heading level={3}>Single database, no replica</Heading>
          <Badge tone="high">high</Badge>
        </Stack>
        <Text tone="secondary" size="sm">
          At this read volume a single primary is both the bottleneck and the single point of
          failure. Add a read replica and route the history queries to it.
        </Text>
      </Stack>
    </Surface>
  ),
};

/** Landmark semantics when the panel is one. */
export const AsAside: Story = {
  render: (args) => (
    <Surface {...args} as="aside" aria-label="Evaluation summary">
      <Text>Score 82 — grade B. Two medium findings remain.</Text>
    </Surface>
  ),
};

export const TightPadding: Story = {
  render: (args) => (
    <Surface {...args} padding={3}>
      <Text size="sm">Compact panel</Text>
    </Surface>
  ),
};
