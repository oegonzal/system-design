import type { RaisedAlertView } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { ALERT_VIEW } from '../../testing/fixtures';
import { AlertList } from './alert-list';

const AWARD = ALERT_VIEW.key.subject;
const named = {
  profileId: 'enfav',
  externalId: AWARD,
  piid: '89303019FET000003',
  recipientName: 'BOOZ ALLEN HAMILTON INC',
  agencyPath: 'Department of Energy.Department of Energy.HEADQUARTERS PROCUREMENT SERVICES',
};

/** One of each kind, newest first, and one kept from before payloads were. */
const ALERTS: RaisedAlertView[] = [
  {
    id: 'a-4',
    key: { kind: 'award-notice', subject: `${AWARD}|n-1` },
    profileId: 'enfav',
    raisedAt: '2026-09-28T10:41:00.000Z',
    alert: {
      topic: 'govcon.award.notice',
      key: { kind: 'award-notice', subject: `${AWARD}|n-1` },
      payload: {
        ...named,
        noticeId: 'n-1',
        title: 'Cyber support follow-on',
        noticeType: 'Sources Sought',
        responseDeadlineAt: '2026-11-15T17:00:00.000Z',
      },
    },
  },
  {
    id: 'a-3',
    key: { kind: 'award-end-moved', subject: `${AWARD}|2027-12-26` },
    profileId: 'enfav',
    raisedAt: '2026-09-28T10:41:00.000Z',
    alert: {
      topic: 'govcon.award.end-moved',
      key: { kind: 'award-end-moved', subject: `${AWARD}|2027-12-26` },
      payload: { ...named, from: '2026-12-26', to: '2027-12-26' },
    },
  },
  {
    id: 'a-2',
    key: { kind: 'pulse-above-band', subject: '2026-12' },
    profileId: 'enfav',
    raisedAt: '2026-09-27T10:41:00.000Z',
    alert: {
      topic: 'govcon.pulse.above-band',
      key: { kind: 'pulse-above-band', subject: '2026-12' },
      payload: {
        profileId: 'enfav',
        scopeKey: 'a'.repeat(64),
        fiscalYear: 2026,
        period: 12,
        total: 9_100_000_000,
        expected: 6_400_000_000,
        high: 8_200_000_000,
      },
    },
  },
  ALERT_VIEW,
  {
    id: 'a-0',
    key: { kind: 'award-ending', subject: 'CONT_AWD_OLD_9700_-NONE-_-NONE-' },
    profileId: 'enfav',
    raisedAt: '2026-09-20T10:41:00.000Z',
    alert: null,
  },
];

const meta: Meta<typeof AlertList> = {
  title: 'Govcon/Alerts/AlertList',
  component: AlertList,
  args: { alerts: ALERTS, total: ALERTS.length, limit: 10, offset: 0, onPage: fn() },
};
export default meta;

type Story = StoryObj<typeof AlertList>;

/** Every kind of alert, and one whose payload was never kept. */
export const Default: Story = {};

/** The second page of many. */
export const Paged: Story = { args: { alerts: [ALERT_VIEW], total: 37, limit: 10, offset: 10 } };

/** Nothing raised yet. */
export const Empty: Story = { args: { alerts: [], total: 0 } };
