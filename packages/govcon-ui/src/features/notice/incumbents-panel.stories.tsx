import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { INCUMBENTS } from '../../testing/spending-fixtures';
import { IncumbentsPanel } from './incumbents-panel';

const meta: Meta<typeof IncumbentsPanel> = {
  title: 'Govcon/Notice/IncumbentsPanel',
  component: IncumbentsPanel,
  args: {
    noticePsc: '5340',
    incumbents: null,
    samePsc: true,
    onSamePscChange: fn(),
    onAsk: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof IncumbentsPanel>;

/** Not asked yet: the read goes to the award source, so it waits for a click. */
export const Unasked: Story = {};

/** Two of the three awards the scope lists are at the notice's own sub-agency. */
export const Found: Story = { args: { incumbents: INCUMBENTS } };

/** A scope too busy to list every month: the list says how far it is complete. */
export const Capped: Story = {
  args: { incumbents: { ...INCUMBENTS, capped: true, completeBefore: '2026-11-30' } },
};

/** The scope lists awards, none of them at this buyer. */
export const NoneHere: Story = { args: { incumbents: { ...INCUMBENTS, rows: [] } } };

/** The notice names no code the award data takes: nothing was read. */
export const Gap: Story = {
  args: {
    incumbents: {
      ...INCUMBENTS,
      gap: 'naics',
      scope: null,
      rows: [],
      listed: 0,
      provenance: null,
    },
  },
};

/** The narrowing unticked: the panel says what the wider read costs. */
export const AnyPsc: Story = { args: { samePsc: false } };

/** A notice with no product service code: nothing to narrow to. */
export const NoPsc: Story = { args: { noticePsc: null } };

export const Reading: Story = { args: { loading: true } };

export const Failed: Story = { args: { error: 'error: status 503' } };
