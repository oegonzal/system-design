import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stack } from '../stack/stack';
import { Surface } from '../surface/surface';
import { Skeleton } from './skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Design System/Primitives/Skeleton',
  component: Skeleton,
  argTypes: {
    variant: { control: 'inline-radio', options: ['text', 'block', 'circle'] },
  },
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

export const TextLine: Story = { args: { width: '240px' } };

export const Block: Story = { args: { variant: 'block', width: '320px', height: '120px' } };

export const Circle: Story = { args: { variant: 'circle', width: '40px', height: '40px' } };

/** A loading card — the container, not each bone, carries `aria-busy`. */
export const LoadingCard: Story = {
  render: () => (
    <Surface aria-busy="true" style={{ maxWidth: 360 }}>
      <Stack gap={3}>
        <Skeleton width="60%" />
        <Skeleton />
        <Skeleton />
        <Skeleton variant="block" height="80px" />
      </Stack>
    </Surface>
  ),
};
