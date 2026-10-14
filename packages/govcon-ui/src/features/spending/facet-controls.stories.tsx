import { NO_FACETS } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { FacetControls } from './facet-controls';

const meta: Meta<typeof FacetControls> = {
  title: 'Govcon/Spending/FacetControls',
  component: FacetControls,
  args: { facets: NO_FACETS, onCommit: fn(), onSettle: fn() },
};
export default meta;

type Story = StoryObj<typeof FacetControls>;

/** Nothing narrowed: every control at rest. */
export const Unset: Story = {};

/** Every facet set from the table's own choices. */
export const Narrowed: Story = {
  args: {
    facets: {
      ...NO_FACETS,
      recipient: ['SMNWM6HN79X5'],
      recipientSize: 'small',
      placement: 'standalone',
      setAside: ['NONE', 'SBA'],
      amount: { min: 15_000.01, max: 350_000 },
      newOnly: true,
    },
  },
};

/** What an address may name that the table does not offer: a code and a range of its own, each shown pressed. */
export const Unlisted: Story = {
  args: {
    facets: { ...NO_FACETS, setAside: ['RSB', 'SBA'], amount: { min: 50_000, max: 2_000_000 } },
  },
};

/** A one-press setting the profile supplies: its own lanes. */
export const WithPreset: Story = {
  args: { presets: { setAside: { label: 'My lanes', raw: 'NONE,SBA,SBP' } } },
};

/** The preset already applied: pressed, and one press clears it. */
export const PresetApplied: Story = {
  args: {
    facets: { ...NO_FACETS, setAside: ['NONE', 'SBA', 'SBP'] },
    presets: { setAside: { label: 'My lanes', raw: 'NONE,SBA,SBP' } },
  },
};
