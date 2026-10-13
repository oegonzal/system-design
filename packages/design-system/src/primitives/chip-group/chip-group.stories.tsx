import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { ChipGroup } from './chip-group';

const meta: Meta<typeof ChipGroup> = {
  title: 'Design System/Primitives/ChipGroup',
  component: ChipGroup,
  args: {
    label: 'Window',
    options: [
      { id: 'fytd', label: 'Fiscal year to date' },
      { id: 'prior-fy', label: 'Prior fiscal year' },
      { id: 'last-12-months', label: 'Last 12 months' },
    ],
    value: ['last-12-months'],
    onToggle: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof ChipGroup>;

/** One choice among a few: exactly one chip is pressed. */
export const SingleChoice: Story = {};

/** A set of codes pressed in and out, the row named in view, each code saying what it stands for. */
export const CodeSet: Story = {
  args: {
    label: 'Set-aside',
    showLabel: true,
    options: [
      { id: 'NONE', label: 'NONE', description: 'No set-aside' },
      { id: 'SBA', label: 'SBA', description: 'Small business' },
      { id: 'SBP', label: 'SBP', description: 'Small business, partial' },
      { id: '8A', label: '8A', description: '8(a), competed' },
    ],
    value: ['NONE', 'SBA'],
  },
};

export const Disabled: Story = { args: { disabled: true } };
