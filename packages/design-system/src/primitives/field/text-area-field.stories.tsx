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

/** A hint under the area says what the prose is for, and stays while it is written. */
export const WithHint: Story = {
  args: { hint: 'The graders read this with the diagram: say why each component is there.' },
};

/** A refused value: the reason under the control, which is marked invalid and described by it. */
export const Invalid: Story = { args: { error: 'Say how a request travels.', required: true } };

/** A capped area says how much is left as its `maxLength` nears, like the single-line field. */
export const NearLimit: Story = {
  args: { maxLength: 60, defaultValue: 'Requests enter through the gateway and fan out to shards' },
};

/**
 * An area that takes more than it asks for — a bound's ceiling as
 * `maxLength`, its target as `target`: past the ask it says how far over the
 * value runs and what is taken at most, and the limit is reached only at
 * the ceiling.
 */
export const OverTarget: Story = {
  args: {
    maxLength: 75,
    target: 60,
    defaultValue: 'Requests enter through the gateway and fan out to the shards.',
  },
};

/**
 * Prose set past the `maxLength` from code — a coach revision imported
 * whole — stays whole on screen: the count says how far past the most
 * accepted it runs and that it must be shortened to submit.
 */
export const PastCeiling: Story = {
  args: {
    maxLength: 75,
    target: 60,
    defaultValue:
      'Requests enter through the gateway, fan out to the shards and are retried at most twice.',
  },
};
