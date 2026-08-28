import { NODE_KINDS, SEVERITIES } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'Design System/Primitives/Badge',
  component: Badge,
  args: { children: '3 findings' },
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'accent', ...SEVERITIES],
    },
    kind: { control: 'select', options: [undefined, ...NODE_KINDS] },
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

/** Counts and quiet states. */
export const Neutral: Story = {};

/** Tied to the current accent — "selected", "active". */
export const Accent: Story = { args: { tone: 'accent', children: 'selected' } };

/** A finding chip, coloured from the severity pairs the findings panel uses. */
export const Critical: Story = { args: { tone: 'critical', children: 'critical' } };

/** All five severities, in urgency order. */
export const Severities: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {SEVERITIES.map((severity) => (
        <Badge key={severity} tone={severity}>
          {severity}
        </Badge>
      ))}
    </div>
  ),
};

/** A canvas identity chip. Mode-independent — same colour in dark mode. */
export const NodeKind: Story = { args: { kind: 'database', children: 'database' } };

/** Every node kind the palette offers, grouped hues visible at a glance. */
export const AllNodeKinds: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 480 }}>
      {NODE_KINDS.map((kind) => (
        <Badge key={kind} kind={kind}>
          {kind}
        </Badge>
      ))}
    </div>
  ),
};
