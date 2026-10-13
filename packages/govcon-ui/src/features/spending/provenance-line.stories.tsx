import { provenanceOf } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ProvenanceLine } from './provenance-line';

const meta: Meta<typeof ProvenanceLine> = {
  title: 'Govcon/Spending/ProvenanceLine',
  component: ProvenanceLine,
  args: { provenance: provenanceOf() },
};
export default meta;

type Story = StoryObj<typeof ProvenanceLine>;

/** Served from the day's snapshot, with the source's one declared fact. */
export const Default: Story = {};

/** Fetched just now, seven pages. */
export const FromSource: Story = {
  args: { provenance: provenanceOf({ servedFrom: 'source', requests: 7 }) },
};

/** The refresh failed; an older snapshot answers, and says so. */
export const Stale: Story = {
  args: {
    provenance: provenanceOf({ servedFrom: 'stale', fetchedAt: '2026-06-13T13:00:00.000Z' }),
  },
};

/** A source with nothing to declare and no "as of". */
export const Bare: Story = {
  args: { provenance: provenanceOf({ asOf: null, disclosures: [] }) },
};
