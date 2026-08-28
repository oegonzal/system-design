import type { Meta, StoryObj } from '@storybook/react-vite';

import { Spinner } from './spinner';

const meta: Meta<typeof Spinner> = {
  title: 'Design System/Primitives/Spinner',
  component: Spinner,
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
};
export default meta;

type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

export const Medium: Story = { args: { size: 'md', label: 'Evaluating design…' } };

/**
 * An empty label for when a parent live region already announces the load —
 * two regions describing one event is noise, not redundancy.
 */
export const Unlabelled: Story = { args: { label: '' } };
