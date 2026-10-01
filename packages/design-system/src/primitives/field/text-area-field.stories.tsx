import type { Meta, StoryObj } from '@storybook/react-vite';

import { TextAreaField } from './text-area-field';

const meta: Meta<typeof TextAreaField> = {
  title: 'Design System/Primitives/TextAreaField',
  component: TextAreaField,
  args: { label: 'Design narrative' },
  argTypes: { disabled: { control: 'boolean' }, rows: { control: 'number' } },
};
export default meta;

type Story = StoryObj<typeof TextAreaField>;

/** Four rows by default. */
export const Default: Story = {};

export const Tall: Story = {
  args: { rows: 8, defaultValue: 'Requests enter through the gateway…' },
};

export const Disabled: Story = { args: { disabled: true, defaultValue: 'read only' } };

/** A refused value: the reason under the control, which is marked invalid and described by it. */
export const Invalid: Story = { args: { error: 'Say how a request travels.', required: true } };
