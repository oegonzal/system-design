import type { Meta, StoryObj } from '@storybook/react-vite';

import { Text } from './text';

const meta: Meta<typeof Text> = {
  title: 'Design System/Primitives/Text',
  component: Text,
  args: { children: 'Reads served from the projection, writes through the queue.' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['primary', 'secondary', 'muted'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    as: { control: 'inline-radio', options: ['p', 'span'] },
  },
};
export default meta;

type Story = StoryObj<typeof Text>;

export const Primary: Story = {};

export const Secondary: Story = { args: { tone: 'secondary' } };

/** Muted still clears 4.5:1 on every background role — asserted, not assumed. */
export const Muted: Story = { args: { tone: 'muted', size: 'sm' } };

/** All tone and size combinations, for eyeballing a scale change. */
export const Matrix: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {(['primary', 'secondary', 'muted'] as const).map((tone) =>
        (['lg', 'md', 'sm'] as const).map((size) => (
          <Text key={`${tone}-${size}`} tone={tone} size={size}>
            {tone} / {size} — the cache is warmed by the projector, not the reader.
          </Text>
        )),
      )}
    </div>
  ),
};
