import type { Meta, StoryObj } from '@storybook/react-vite';

import { Surface } from '../surface/surface';
import { Text } from '../text/text';
import { Stack } from './stack';

const meta: Meta<typeof Stack> = {
  title: 'Design System/Primitives/Stack',
  component: Stack,
  argTypes: {
    direction: { control: 'inline-radio', options: ['column', 'row'] },
    gap: { control: { type: 'number', min: 0, max: 8, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<typeof Stack>;

const items = ['Gateway', 'Service', 'Database'];

export const Column: Story = {
  render: (args) => (
    <Stack {...args}>
      {items.map((item) => (
        <Surface key={item} padding={4}>
          <Text>{item}</Text>
        </Surface>
      ))}
    </Stack>
  ),
};

export const Row: Story = {
  ...Column,
  args: { direction: 'row', gap: 4 },
};

/** `as="ul"` keeps list semantics; the bullets are already removed. */
export const AsList: Story = {
  render: (args) => (
    <Stack {...args} as="ul" gap={2}>
      {items.map((item) => (
        <li key={item}>
          <Text as="span">{item}</Text>
        </li>
      ))}
    </Stack>
  ),
};

export const SpaceBetween: Story = {
  render: (args) => (
    <Stack {...args} direction="row" justify="between">
      <Text>Order History design</Text>
      <Text tone="muted" size="sm">
        rev 4
      </Text>
    </Stack>
  ),
};
