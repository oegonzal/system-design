import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stack } from '../stack/stack';
import { Meter } from './meter';

const meta: Meta<typeof Meter> = {
  title: 'Design System/Primitives/Meter',
  component: Meter,
  args: { label: 'Reliability', value: 74 },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    tone: { control: 'inline-radio', options: [undefined, 'danger', 'warn', 'success'] },
  },
};
export default meta;

type Story = StoryObj<typeof Meter>;

export const Default: Story = {};

/** The auto-tone bands: below 40 danger, 40–69 warn, 70+ success. */
export const AutoTone: Story = {
  render: () => (
    <Stack gap={4} style={{ maxWidth: 320 }}>
      <Meter label="Security" value={22} />
      <Meter label="Reliability" value={55} />
      <Meter label="Scalability" value={88} />
    </Stack>
  ),
};

/** Explicit tone for an inverted scale — a full queue is the bad end. */
export const ExplicitTone: Story = {
  args: { label: 'Queue depth', value: 92, tone: 'danger' },
};

/** Out-of-range input clamps rather than throwing. */
export const Clamped: Story = { args: { label: 'Overall', value: 103 } };

/** An app's own score format: the meter prints what it is given, so it never disagrees with the page. */
export const Formatted: Story = {
  args: { label: 'Coverage', value: 79.46, formatValue: (value: number) => value.toFixed(1) },
};
