import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stack } from '../stack/stack';
import { Alert, type AlertTone } from './alert';

const meta: Meta<typeof Alert> = {
  title: 'Design System/Primitives/Alert',
  component: Alert,
  args: { children: 'The budget is spent: 1000 of 1000 requests used in the last 24 h.' },
  argTypes: { tone: { control: 'select', options: ['info', 'success', 'warn', 'danger'] } },
};
export default meta;

type Story = StoryObj<typeof Alert>;

/** Waits its turn: `role="status"`. */
export const Info: Story = {};

/** Something saved. */
export const Success: Story = {
  args: { tone: 'success', title: 'Profile saved', children: 'Weights sum to 1.' },
};

/** Interrupts: `role="alert"`. */
export const Warn: Story = { args: { tone: 'warn', title: 'Budget nearly spent' } };

/** A failure beside the thing that failed. */
export const Danger: Story = {
  args: { tone: 'danger', title: 'Description not fetched', children: 'rate-limited: over quota' },
};

/** All four tones, so the pairs are checked together. */
export const AllTones: Story = {
  render: () => (
    <Stack gap={3}>
      {(['info', 'success', 'warn', 'danger'] as AlertTone[]).map((tone) => (
        <Alert key={tone} tone={tone} title={tone}>
          The same message in every tone.
        </Alert>
      ))}
    </Stack>
  ),
};
