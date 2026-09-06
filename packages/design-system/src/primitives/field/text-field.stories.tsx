import type { Meta, StoryObj } from '@storybook/react-vite';

import { TextField } from './text-field';

const meta: Meta<typeof TextField> = {
  title: 'Design System/Primitives/TextField',
  component: TextField,
  args: { label: 'Service name' },
  argTypes: { disabled: { control: 'boolean' } },
};
export default meta;

type Story = StoryObj<typeof TextField>;

export const Default: Story = {};

export const WithPlaceholder: Story = { args: { placeholder: 'order-history' } };

export const WithValue: Story = { args: { defaultValue: 'order-history' } };

/** An explicit id wins over the generated one, so external labels and tests can target it. */
export const ExplicitId: Story = { args: { id: 'service-name', defaultValue: 'checkout' } };

export const Disabled: Story = { args: { disabled: true, defaultValue: 'read only' } };

export const Numeric: Story = {
  args: { label: 'Iterations', type: 'number', min: 1, max: 10, defaultValue: 1 },
};
