import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { FIRM_TARGET, TARGET } from '../../testing/fixtures';
import { TargetPanel } from './target-panel';

const meta: Meta<typeof TargetPanel> = {
  title: 'Govcon/Targets/TargetPanel',
  component: TargetPanel,
  args: {
    kind: 'award',
    label: TARGET.label,
    target: null,
    onSave: fn(),
    onRemove: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof TargetPanel>;

/** An award nobody tracks yet: its kind's first stage, and one button. */
export const Untracked: Story = {};

/** A tracked award, part way through its own stages. */
export const Tracked: Story = {
  args: {
    target: {
      ...TARGET,
      stage: 'researching',
      contact: 'A. Contracting Officer',
      notes: 'Recompete expected in the spring.',
      reminderAt: '2026-10-05T15:00:00.000Z',
    },
  },
};

/** A firm has its own stages. */
export const Firm: Story = {
  args: { kind: 'firm', label: FIRM_TARGET.label, target: FIRM_TARGET },
};

export const Saving: Story = { args: { target: TARGET, saving: true } };

/** The service refused the save. */
export const Refused: Story = {
  args: { target: TARGET, error: 'contact: Too big: expected string to have <=300 characters' },
};
