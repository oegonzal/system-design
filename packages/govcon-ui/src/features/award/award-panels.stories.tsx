import { noticeRefOf, opportunityOf } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { AWARD_DETAIL } from '../../testing/spending-fixtures';
import {
  AwardFacts,
  AwardHeader,
  AwardMoney,
  AwardNotices,
  AwardSubcontracts,
} from './award-panels';

const NOW = Date.parse('2026-06-15T12:00:00Z');

const meta: Meta<typeof AwardFacts> = {
  title: 'Govcon/Award',
  component: AwardFacts,
  args: { award: AWARD_DETAIL },
};
export default meta;

type Story = StoryObj<typeof AwardFacts>;

/** An order under a single-award vehicle, competed with three offers. */
export const Facts: Story = {};

/** A contract of its own, on a schedule record: no vehicle, offers the buyer did not count, and no subcontracting plan stated. */
export const FactsStandalone: Story = {
  args: {
    award: {
      ...AWARD_DETAIL,
      vehicle: null,
      subcontractingPlan: null,
      competition: {
        ...AWARD_DETAIL.competition,
        offers: null,
        setAside: null,
        setAsideCode: 'SBA',
      },
    },
  },
};

/** A vehicle several firms hold: nothing above it, and its money on its orders. */
const VEHICLE = {
  ...AWARD_DETAIL,
  externalId: 'CONT_IDV_W912DY20D0079_9700',
  piid: 'W912DY20D0079',
  family: 'idvs' as const,
  typeDescription: 'INDEFINITE DELIVERY / INDEFINITE QUANTITY',
  vehicle: null,
  holders: 'MULTIPLE AWARD',
  orders: { count: 9, obligated: 47_594_534.33, vehicles: 0 },
  obligated: 0,
  exercised: null,
  ceiling: 2_591_395_960,
  endsAt: '2027-01-21',
  endsWithOptionsAt: null,
};

export const FactsVehicle: Story = { args: { award: VEHICLE } };

export const Header: Story = { render: () => <AwardHeader award={AWARD_DETAIL} /> };

/** The end in six months, and a year more if every option is exercised. */
export const Money: Story = { render: () => <AwardMoney award={AWARD_DETAIL} nowMs={NOW} /> };

/** No option is left, and the source gives no ceiling. */
export const MoneyNoOptions: Story = {
  render: () => (
    <AwardMoney
      award={{ ...AWARD_DETAIL, endsWithOptionsAt: AWARD_DETAIL.endsAt, ceiling: null }}
      nowMs={NOW}
    />
  ),
};

/** A vehicle is read by what was ordered under it, never by its own obligations. */
export const MoneyVehicle: Story = { render: () => <AwardMoney award={VEHICLE} nowMs={NOW} /> };

/** A schedule: its orders are placed through the agreements awarded under it. */
export const MoneySchedule: Story = {
  render: () => (
    <AwardMoney
      award={{
        ...VEHICLE,
        ceiling: null,
        orders: { count: 1_204, obligated: 88_250_000, vehicles: 37 },
      }}
      nowMs={NOW}
    />
  ),
};

export const Subcontracts: Story = { render: () => <AwardSubcontracts award={AWARD_DETAIL} /> };

export const NoSubcontracts: Story = {
  render: () => (
    <AwardSubcontracts
      award={{ ...AWARD_DETAIL, subcontracts: [], subcontractCount: 0, subcontractAmount: 0 }}
    />
  ),
};

export const Notices: Story = {
  render: () => <AwardNotices notices={[noticeRefOf(opportunityOf())]} />,
};

export const NoNotices: Story = { render: () => <AwardNotices notices={[]} /> };
