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

/** A refused value: the reason under the control, which is marked invalid and described by it. */
export const Invalid: Story = {
  args: { defaultValue: '', error: 'A service needs a name.', required: true },
};

/**
 * A capped field says how much is left once the value is within the last
 * tenth of its `maxLength` — nothing before that — so the cap never cuts
 * text off unsaid. The count describes the control; entering the last
 * stretch is announced once.
 */
export const NearLimit: Story = { args: { maxLength: 20, defaultValue: 'order-history-read' } };

/** At the cap the count turns to a warning that names the limit, and reaching it is announced. */
export const AtLimit: Story = { args: { maxLength: 20, defaultValue: 'order-history-reader' } };

/** `limitNotice="always"`: the count from the first character, for a field where length is the point. */
export const CountedThroughout: Story = {
  args: { maxLength: 40, limitNotice: 'always', defaultValue: 'checkout' },
};
