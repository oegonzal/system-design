import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { AGENCIES, AGENCY_OUTLOOK } from '../../testing/spending-fixtures';
import { AgencyDirectoryTable, AgencyOutlookPanel, SubAgencyTable } from './agency-panels';

const meta: Meta<typeof AgencyOutlookPanel> = {
  title: 'Govcon/Spending/Agency',
  component: AgencyOutlookPanel,
  args: { outlook: AGENCY_OUTLOOK },
};
export default meta;

type Story = StoryObj<typeof AgencyOutlookPanel>;

/** The Department of Defense: four years of resources and the cadence by period. */
export const Outlook: Story = {};

export const Directory: Story = {
  render: () => <AgencyDirectoryTable agencies={AGENCIES.entries} selected="097" onSelect={fn()} />,
};

export const SubAgencies: Story = {
  render: () => (
    <SubAgencyTable
      subAgencies={AGENCY_OUTLOOK.subAgencies}
      fiscalYear={2026}
      awardFamily="both"
      truncated={true}
    />
  ),
};

export const NoSubAgencies: Story = {
  render: () => (
    <SubAgencyTable subAgencies={[]} fiscalYear={2026} awardFamily="idvs" truncated={false} />
  ),
};
