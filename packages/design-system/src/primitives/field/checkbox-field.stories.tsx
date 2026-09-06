import type { Meta, StoryObj } from '@storybook/react-vite';

import { CheckboxField } from './checkbox-field';

const meta: Meta<typeof CheckboxField> = {
  title: 'Design System/Primitives/CheckboxField',
  component: CheckboxField,
  args: { label: 'Carries personal data' },
  argTypes: { disabled: { control: 'boolean' } },
};
export default meta;

type Story = StoryObj<typeof CheckboxField>;

export const Unchecked: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };
