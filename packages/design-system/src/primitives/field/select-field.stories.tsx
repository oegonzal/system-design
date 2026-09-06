import type { Meta, StoryObj } from '@storybook/react-vite';

import { SelectField } from './select-field';

const meta: Meta<typeof SelectField> = {
  title: 'Design System/Primitives/SelectField',
  component: SelectField,
  args: {
    label: 'Pipeline',
    children: [
      <option key="system-design" value="system-design">
        system-design
      </option>,
      <option key="code-review" value="code-review">
        code-review
      </option>,
    ],
  },
  argTypes: { disabled: { control: 'boolean' } },
};
export default meta;

type Story = StoryObj<typeof SelectField>;

export const Default: Story = {};

export const Preselected: Story = { args: { defaultValue: 'code-review' } };

export const Disabled: Story = { args: { disabled: true } };
